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
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { defineAbilityFor, type Identity } from '@my-erp/platform';
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

const fund = new FundConsumptionsService();

let noSeq = 0;
function nextNo(): string {
  noSeq += 1;
  return `记-2026-06-${String(noSeq).padStart(3, '0')}`;
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
