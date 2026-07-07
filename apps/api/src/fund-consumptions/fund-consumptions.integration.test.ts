/**
 * Service-level integration test for 货币资金结算/出纳执行 (T-012 Phase 4, D4). Drives the
 * real fund-execution workflow against a live Postgres:
 *   - posting an accountant/manual voucher spawns one cashier fund.consume task PER
 *     cash/bank line (subaccounts included), and only for cash lines;
 *   - consuming records execution WITHOUT posting any second voucher (no ledger effect);
 *   - the assignment gate + optimistic version guard hold;
 *   - settlement vouchers are excluded (isSettlementVoucherTx belt-and-suspenders);
 *   - reversing the source voucher voids the rows + cancels the open tasks (no physical
 *     delete);
 *   - RBAC: a cashier holds consume/FundConsumption but NOT post/Voucher (the D4 point).
 * Skips without a local test Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  APP_ROLE,
  PG_AVAILABLE,
  appDbUrl,
  createTestDb,
  dropTestDb,
  psql,
} from '../../../../packages/db/src/test-pg';
import {
  claimWorkItemTx,
  countVouchersInPeriodTx,
  createVoucherTx,
  disconnectDatabase,
  getLedgerBookByIdTx,
  getWorkItemTx,
  listFundConsumptionsTx,
  listWorkItemsTx,
  seedAccountsTx,
  setVoucherStatusTx,
  withScope,
  type SeedAccountInput,
  type VoucherLineInput,
} from '@my-erp/db';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { defineAbilityFor, type Identity, type ObjectStore } from '@my-erp/platform';
import { postVoucherReviewTx } from '../work-items/voucher-workflow';
import { FUND_CONSUME_WORK_ITEM_TYPE } from '../work-items/fund-workflow';
import { VouchersController } from '../vouchers/vouchers.controller';
import { FundConsumptionsService } from './fund-consumptions.service';

const TEST_DB = 'myerp_t012_fund_test';
const ORG = '00000000-0000-0000-0000-0000000005a0';
const LB = '00000000-0000-0000-0000-0000000005a1'; // single-person mode (accountant self-posts)

const acc: Identity = { userId: 'acc', orgId: ORG, ledgerBookId: LB, roles: ['accountant'] };
const cashA: Identity = { userId: 'cashA', orgId: ORG, ledgerBookId: LB, roles: ['cashier'] };
const cashB: Identity = { userId: 'cashB', orgId: ORG, ledgerBookId: LB, roles: ['cashier'] };
const sup: Identity = { userId: 'sup', orgId: ORG, ledgerBookId: LB, roles: ['supervisor'] };

const CHART: readonly SeedAccountInput[] = [
  { code: '1001', name: '库存现金', category: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: true },
  { code: '1002', name: '银行存款', category: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: false },
  { code: '100201', name: '银行存款/基本户', category: 'asset', direction: 'debit', parentCode: '1002', level: 2, isLeaf: true },
  { code: '1122', name: '应收账款', category: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: true },
  { code: '2202', name: '应付账款', category: 'liability', direction: 'credit', parentCode: null, level: 1, isLeaf: true },
  { code: '6001', name: '主营业务收入', category: 'income', direction: 'credit', parentCode: null, level: 1, isLeaf: true },
];

// In-memory object store (T-014) — avoids touching the disk in tests.
const objectBytes = new Map<string, Uint8Array>();
const objectStore: ObjectStore = {
  async put({ orgId, ledgerBookId, bytes }) {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storageKey = `${orgId}/${ledgerBookId}/${sha256}`;
    objectBytes.set(storageKey, bytes);
    return { storageKey, sha256, byteSize: bytes.byteLength };
  },
  async getUrl(storageKey) {
    return `/x/${storageKey}`;
  },
  async get(storageKey) {
    const b = objectBytes.get(storageKey);
    if (!b) throw new Error('not found');
    return b;
  },
};

const fund = new FundConsumptionsService(objectStore);

let noSeq = 0;
function nextNo(): string {
  noSeq += 1;
  // T-prefixed sequence: the reverse endpoint derives its reversal no from
  // countVouchersInPeriodTx (plain 记-YYYY-MM-NNN), which would collide with a
  // plain counter here once the counts cross.
  return `记-2026-06-T${String(noSeq).padStart(3, '0')}`;
}

function sum(lines: readonly VoucherLineInput[], side: 'debit' | 'credit'): string {
  const total = lines.reduce((acc, l) => acc + Number(l[side] ?? 0), 0);
  return total.toFixed(2);
}

/** Create a draft voucher, promote to pending, and post it as the accountant (self-post
 * allowed in single-person mode). Returns the posted voucher id + period. */
async function postManual(lines: readonly VoucherLineInput[]): Promise<{ id: string; period: string }> {
  const period = '2026-06';
  return withScope(ORG, LB, async (tx) => {
    const v = await createVoucherTx(tx, {
      ledgerBookId: LB,
      no: nextNo(),
      date: '2026-06-15',
      period,
      summary: '资金业务',
      maker: acc.userId,
      totalDebit: sum(lines, 'debit'),
      totalCredit: sum(lines, 'credit'),
      lines,
    });
    await setVoucherStatusTx(tx, v.id, { status: 'pending' });
    const book = await getLedgerBookByIdTx(tx, LB);
    if (!book) throw new Error('ledger book missing');
    const posted = await postVoucherReviewTx(tx, {
      ledgerBookId: LB,
      book,
      identity: acc,
      voucherId: v.id,
      confirmSinglePerson: true,
    });
    return { id: posted.id, period };
  });
}

async function fundItemFor(voucherId: string) {
  return withScope(ORG, LB, async (tx) => {
    const items = await listWorkItemsTx(tx, {
      view: 'supervision',
      actorId: 'x',
      roles: [],
      supervisionCapable: true,
      includeClosed: true,
      sourceType: 'JournalVoucher',
      sourceId: voucherId,
    });
    return items.find((i) => i.workItemType === FUND_CONSUME_WORK_ITEM_TYPE);
  });
}

describe.skipIf(!PG_AVAILABLE)('fund consumption (service integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT ON "period_close" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "account" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "fund_consumption" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "attachment" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "work_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "work_item_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "outbox_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org 5A');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year,single_person_mode) VALUES
         ('${LB}','${ORG}','Fund Book','CNY',2026,true);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
    await withScope(ORG, LB, (tx) => seedAccountsTx(tx, LB, CHART));
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('posting a cash-line voucher spawns exactly one cashier fund.consume task (inflow)', async () => {
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '1000.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '1000.00' },
    ]);

    const rows = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    expect(rows).toHaveLength(1); // only the cash line, not 6001
    expect(rows[0].accountCode).toBe('1001');
    expect(rows[0].direction).toBe('inflow'); // 借 cash → money in
    expect(rows[0].amount).toBe('1000.00');
    expect(rows[0].executionStatus).toBe('pending');

    const item = await fundItemFor(id);
    expect(item?.assignedRole).toBe('cashier');
    expect(item?.status).toBe('open');
    expect(rows[0].workItemId).toBe(item?.id);
  });

  it('a credit-to-cash line spawns an outflow task', async () => {
    const { id } = await postManual([
      { accountCode: '2202', accountName: '应付账款', summary: '付款', debit: '300.00', credit: null },
      { accountCode: '1001', accountName: '库存现金', summary: '付款', debit: null, credit: '300.00' },
    ]);
    const rows = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    expect(rows).toHaveLength(1);
    expect(rows[0].accountCode).toBe('1001');
    expect(rows[0].direction).toBe('outflow'); // 贷 cash → money out
    expect(rows[0].amount).toBe('300.00');
  });

  it('a cash SUBACCOUNT line still spawns a task (tree-prefix)', async () => {
    const { id } = await postManual([
      { accountCode: '100201', accountName: '银行存款/基本户', summary: '收款', debit: '500.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '500.00' },
    ]);
    const rows = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    expect(rows).toHaveLength(1);
    expect(rows[0].accountCode).toBe('100201');
  });

  it('a voucher with NO cash line spawns nothing', async () => {
    const { id } = await postManual([
      { accountCode: '1122', accountName: '应收账款', summary: '挂账', debit: '200.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '200.00' },
    ]);
    const rows = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    expect(rows).toHaveLength(0);
    expect(await fundItemFor(id)).toBeUndefined();
  });

  it('a cashier consumes (executed) WITHOUT posting any second voucher; the task completes', async () => {
    const { id, period } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '800.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '800.00' },
    ]);
    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    const before = await withScope(ORG, LB, (tx) => countVouchersInPeriodTx(tx, period));

    const consumed = await fund.consume(cashA, LB, row.id, {
      expectedVersion: row.version,
      executionStatus: 'executed',
      bankFlowRef: 'BANK-2026-0001',
    });
    expect(consumed.executionStatus).toBe('executed');
    expect(consumed.executedBy).toBe('cashA');
    expect(consumed.bankFlowRef).toBe('BANK-2026-0001');

    // No ledger effect: consuming never creates a voucher.
    const after = await withScope(ORG, LB, (tx) => countVouchersInPeriodTx(tx, period));
    expect(after).toBe(before);

    // The paired task is completed.
    const item = await fundItemFor(id);
    expect(item?.status).toBe('completed');
  });

  it('consuming with a stale version is rejected (optimistic guard)', async () => {
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '150.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '150.00' },
    ]);
    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    await expect(
      fund.consume(cashA, LB, row.id, { expectedVersion: row.version + 5, executionStatus: 'executed' }),
    ).rejects.toThrow();
  });

  it('the assignment gate: a claimed task rejects another cashier but a supervisor can override', async () => {
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '640.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '640.00' },
    ]);
    const item = await fundItemFor(id);
    // cashA claims the task.
    await withScope(ORG, LB, (tx) => claimWorkItemTx(tx, item!.id, cashA.userId));

    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    // cashB (no supervision) cannot consume a task claimed by cashA.
    await expect(
      fund.consume(cashB, LB, row.id, { expectedVersion: row.version, executionStatus: 'executed' }),
    ).rejects.toThrow(/已被他人领取/);
    // A supervisor overrides.
    const consumed = await fund.consume(sup, LB, row.id, {
      expectedVersion: row.version,
      executionStatus: 'executed',
    });
    expect(consumed.executionStatus).toBe('executed');
    expect(consumed.executedBy).toBe('sup');
  });

  it('a settlement voucher is excluded from spawn (isSettlementVoucherTx guard)', async () => {
    // A pending voucher that IS a settlement voucher (referenced by a payment_doc).
    const voucherId = await withScope(ORG, LB, async (tx) => {
      const v = await createVoucherTx(tx, {
        ledgerBookId: LB,
        no: nextNo(),
        date: '2026-06-15',
        period: '2026-06',
        summary: '结算凭证',
        maker: acc.userId,
        totalDebit: '250.00',
        totalCredit: '250.00',
        lines: [
          { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '250.00', credit: null },
          { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '250.00' },
        ],
      });
      await setVoucherStatusTx(tx, v.id, { status: 'pending' });
      return v.id;
    });
    psql(
      TEST_DB,
      `INSERT INTO "payment_doc"(id,ledger_book_id,no,direction,date,period,counterparty,summary,amount,settlement_voucher_id,status,maker,updated_at)
       VALUES ('00000000-0000-0000-0000-0000000005b0','${LB}','收-SET-001','receipt','2026-06-15','2026-06','某客户','结算','250.00','${voucherId}','confirmed','acc',now());`,
    );

    const posted = await withScope(ORG, LB, async (tx) => {
      const book = await getLedgerBookByIdTx(tx, LB);
      return postVoucherReviewTx(tx, {
        ledgerBookId: LB,
        book: book!,
        identity: acc,
        voucherId,
        confirmSinglePerson: true,
      });
    });
    expect(posted.status).toBe('posted');

    const rows = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId }));
    expect(rows).toHaveLength(0); // settlement voucher → no cashier fund task
  });

  it('an accountant (not cashier/admin/supervisor) cannot consume an UNCLAIMED cashier fund task via REST', async () => {
    // Regression: the REST gate must enforce role-eligibility for unclaimed tasks, the way
    // the workbench canCompleteFundConsume does — else the accountant who posted the voucher
    // could execute its cashier fund line, defeating the accountant→cashier separation.
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '120.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '120.00' },
    ]);
    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    await expect(
      fund.consume(acc, LB, row.id, { expectedVersion: row.version, executionStatus: 'executed' }),
    ).rejects.toThrow(ForbiddenException); // 该出纳任务需由出纳处理
    // The cashier (role-eligible) still can.
    const consumed = await fund.consume(cashA, LB, row.id, {
      expectedVersion: row.version,
      executionStatus: 'executed',
    });
    expect(consumed.executionStatus).toBe('executed');
  });

  it('the reverse CONTROLLER path (app-role RLS) voids the rows + cancels the open task', async () => {
    // Regression: reverse() must run under withScope, not withLedgerScope — the fund-task
    // cancel touches ORG-scoped work_item/outbox, so under a ledger-only scope the RLS org
    // clause hides every row and the task would silently stay open. Driving the real
    // controller under the app role (RLS enforced) is what catches that; calling the db
    // helpers directly under withScope(ORG, LB) would mask it.
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '900.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '900.00' },
    ]);
    const item = await fundItemFor(id);
    expect(item?.status).toBe('open');

    await new VouchersController().reverse(LB, acc, id);

    const after = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    expect(after).toHaveLength(1); // still present — voided, not deleted
    expect(after[0].executionStatus).toBe('void');
    const canceled = await withScope(ORG, LB, (tx) => getWorkItemTx(tx, item!.id));
    expect(canceled?.status).toBe('canceled'); // would stay 'open' under the withLedgerScope bug

    // A voided row can no longer be consumed — surfaced as a 409 conflict, not a 400.
    await expect(
      fund.consume(cashA, LB, after[0].id, { expectedVersion: after[0].version, executionStatus: 'executed' }),
    ).rejects.toThrow(ConflictException);
  });

  it('T-013: cursor pagination walks all rows without skips or repeats; period filter + pending count', async () => {
    // Three fresh vouchers in a dedicated period area — every earlier test also left rows,
    // so assertions filter by collected ids rather than absolute counts.
    const ids: string[] = [];
    for (const amt of ['11.00', '22.00', '33.00']) {
      const { id } = await postManual([
        { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: amt, credit: null },
        { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: amt },
      ]);
      ids.push(id);
    }

    // Cursor walk with limit 2 over the pending set of the period.
    const page1 = await fund.list(cashA, LB, { period: '2026-06', executionStatus: 'pending', limit: 2 });
    expect(page1.length).toBeLessThanOrEqual(2);
    const page2 = await fund.list(cashA, LB, {
      period: '2026-06',
      executionStatus: 'pending',
      limit: 100,
      cursor: page1[page1.length - 1].id,
    });
    const all = await fund.list(cashA, LB, { period: '2026-06', executionStatus: 'pending' });
    const walked = [...page1, ...page2].map((r) => r.id);
    expect(new Set(walked).size).toBe(walked.length); // no repeats
    expect(walked).toEqual(all.map((r) => r.id)); // no skips, same order

    // Period filter: a bogus period returns nothing; the real one contains the new rows.
    expect(await fund.list(cashA, LB, { period: '2030-01' })).toHaveLength(0);
    const inPeriod = await fund.list(cashA, LB, { period: '2026-06' });
    for (const vid of ids) expect(inPeriod.some((r) => r.voucherId === vid)).toBe(true);

    // voucherId + period intersect: right period → rows; wrong period → empty.
    expect((await fund.list(cashA, LB, { voucherId: ids[0], period: '2026-06' })).length).toBe(1);
    expect(await fund.list(cashA, LB, { voucherId: ids[0], period: '2030-01' })).toHaveLength(0);

    // Pending count matches the unfiltered pending list, and drops after a consume.
    const before = await fund.pendingCount(cashA, LB);
    const pendingAll = await fund.list(cashA, LB, { executionStatus: 'pending' });
    expect(before.count).toBe(pendingAll.length);
    const [row] = await fund.list(cashA, LB, { voucherId: ids[0] });
    await fund.consume(cashA, LB, row.id, { expectedVersion: row.version, executionStatus: 'executed' });
    const after = await fund.pendingCount(cashA, LB);
    expect(after.count).toBe(before.count - 1);
  });

  it('T-014: upload attaches a receipt + streams the exact bytes back, with NO outbox event', async () => {
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '410.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '410.00' },
    ]);
    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    expect(row.attachmentId).toBeNull();

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
    const contentBase64 = Buffer.from(png).toString('base64');
    const outboxBefore = await withScope(ORG, LB, (tx) => tx.outboxEvent.count());

    const updated = await fund.uploadReceipt(cashA, LB, row.id, {
      contentType: 'image/png',
      contentBase64,
    });
    expect(updated.attachmentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // Compliance: attaching a receipt emits ZERO outbox events (no ecosystem leak).
    const outboxAfter = await withScope(ORG, LB, (tx) => tx.outboxEvent.count());
    expect(outboxAfter).toBe(outboxBefore);
    // …but leaves an internal audit trail.
    const audits = await withScope(ORG, LB, (tx) =>
      tx.auditRecord.count({ where: { action: 'ATTACH_FUND_RECEIPT', entityId: row.id } }),
    );
    expect(audits).toBe(1);

    // Round-trip: the streamed bytes and content-type match exactly.
    const receipt = await fund.getReceipt(cashA, LB, row.id);
    expect(receipt.contentType).toBe('image/png');
    expect(Buffer.from(receipt.bytes).equals(Buffer.from(png))).toBe(true);
  });

  it('T-014: a receipt can be attached to an already-executed line, but not a void one', async () => {
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '330.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '330.00' },
    ]);
    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    // execute first, then attach after the fact
    await fund.consume(cashA, LB, row.id, { expectedVersion: row.version, executionStatus: 'executed' });
    const b64 = Buffer.from(new Uint8Array([1, 2, 3])).toString('base64');
    const after = await fund.uploadReceipt(cashA, LB, row.id, { contentType: 'image/jpeg', contentBase64: b64 });
    expect(after.executionStatus).toBe('executed');
    expect(after.attachmentId).not.toBeNull();

    // reverse → row void → upload rejected
    await new VouchersController().reverse(LB, acc, id);
    await expect(
      fund.uploadReceipt(cashA, LB, row.id, { contentType: 'image/jpeg', contentBase64: b64 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('T-014: upload rejects a non-image/pdf content type and empty content', async () => {
    const { id } = await postManual([
      { accountCode: '1001', accountName: '库存现金', summary: '收款', debit: '90.00', credit: null },
      { accountCode: '6001', accountName: '主营业务收入', summary: '收入', debit: null, credit: '90.00' },
    ]);
    const [row] = await withScope(ORG, LB, (tx) => listFundConsumptionsTx(tx, { voucherId: id }));
    await expect(
      fund.uploadReceipt(cashA, LB, row.id, { contentType: 'text/plain', contentBase64: 'aGk=' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      fund.uploadReceipt(cashA, LB, row.id, { contentType: 'image/png', contentBase64: '' }),
    ).rejects.toThrow(BadRequestException);
    // getReceipt on a line with no attachment → not found
    await expect(fund.getReceipt(cashA, LB, row.id)).rejects.toThrow();
  });

  it('RBAC: a cashier can consume FundConsumption but cannot post a Voucher (D4)', () => {
    const cashierAbility = defineAbilityFor(cashA);
    expect(cashierAbility.can('consume', 'FundConsumption')).toBe(true);
    expect(cashierAbility.can('read', 'FundConsumption')).toBe(true);
    expect(cashierAbility.can('post', 'Voucher')).toBe(false); // the whole point of D4

    const viewerAbility = defineAbilityFor({ ...cashA, roles: ['viewer'] });
    expect(viewerAbility.can('read', 'FundConsumption')).toBe(true);
    expect(viewerAbility.can('consume', 'FundConsumption')).toBe(false);
  });
});
