/**
 * Service-level integration test for the cashier payment lifecycle. Drives the real
 * PaymentsService against a live Postgres. Covers T-007 (direct path: state machine,
 * SoD 申请≠审批≠确认, auto-posted settlement voucher) AND T-012 Phase 3
 * (cashier→accountant enrichment: D3 role fork, pending_accounting, payment.enrich
 * WorkItem, D7 voucher-at-confirm-only with aux + cash-flow threaded onto the contra
 * line). Skips without a local test Postgres.
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
  countVouchersInPeriodTx,
  disconnectDatabase,
  listWorkItemsTx,
  seedAccountsTx,
  withLedgerScope,
  withScope,
  type SeedAccountInput,
} from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { PaymentsService } from './payments.service';

const TEST_DB = 'myerp_t007_payments_test';
const ORG = '00000000-0000-0000-0000-00000000000e';
const LB_SP = '00000000-0000-0000-0000-0000000000e1'; // single-person mode
const LB_MP = '00000000-0000-0000-0000-0000000000e2'; // multi-person (SoD enforced)
const LB_PL = '00000000-0000-0000-0000-0000000000e3'; // period-lock enrich isolation

// Accounting-capable identities (post Voucher) take the direct path (T-012 D8).
const u1: Identity = { userId: 'u1', orgId: ORG, ledgerBookId: LB_SP, roles: ['accountant'] };
const u2: Identity = { userId: 'u2', orgId: ORG, ledgerBookId: LB_MP, roles: ['accountant'] };
// Cashier (no post Voucher) → enrichment path.
const cash: Identity = { userId: 'cash', orgId: ORG, ledgerBookId: LB_MP, roles: ['cashier'] };
const acc: Identity = { userId: 'acc', orgId: ORG, ledgerBookId: LB_MP, roles: ['accountant'] };
const sup: Identity = { userId: 'sup', orgId: ORG, ledgerBookId: LB_MP, roles: ['supervisor'] };

const CHART: readonly SeedAccountInput[] = [
  {
    code: '1002',
    name: '银行存款',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '1122',
    name: '应收账款',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['customer'],
  },
  {
    code: '2202',
    name: '应付账款',
    category: 'liability',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['supplier'],
  },
];

const receipt = {
  direction: 'receipt',
  date: '2026-06-10',
  counterparty: '某客户',
  summary: '收回货款',
  amount: '1000.00',
  cashAccountCode: '1002',
  contraAccountCode: '1122',
};

/** Cashier simple doc — business facts only, NO accounting subjects (D3). */
const simple = {
  direction: 'receipt' as const,
  date: '2026-06-11',
  counterparty: '某客户',
  summary: '收回货款（出纳建单）',
  amount: '500.00',
};

const payments = new PaymentsService();

describe.skipIf(!PG_AVAILABLE)('cashier payments (service integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "period_close" TO ${APP_ROLE};
       GRANT SELECT ON "cash_flow_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "account" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "work_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "work_item_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "outbox_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org E');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year,single_person_mode) VALUES
         ('${LB_SP}','${ORG}','SP Book','CNY',2026,true),
         ('${LB_MP}','${ORG}','MP Book','CNY',2026,false),
         ('${LB_PL}','${ORG}','PL Book','CNY',2026,false);
       INSERT INTO "cash_flow_item"(id,ledger_book_id,code,name,activity,direction) VALUES
         ('00000000-0000-0000-0000-0000000000f1','${LB_MP}','0101','销售商品收到的现金','operating','inflow'),
         ('00000000-0000-0000-0000-0000000000f2','${LB_PL}','0101','销售商品收到的现金','operating','inflow');`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
    await withLedgerScope(LB_SP, (tx) => seedAccountsTx(tx, LB_SP, CHART));
    await withLedgerScope(LB_MP, (tx) => seedAccountsTx(tx, LB_MP, CHART));
    await withLedgerScope(LB_PL, (tx) => seedAccountsTx(tx, LB_PL, CHART));
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  // ---- Direct accounting-capable path (T-007 back-compat, D8) ----

  it('single-person: create→submit→approve→confirm posts a balanced settlement voucher', async () => {
    const created = await payments.create(u1, LB_SP, receipt);
    expect(created.status).toBe('draft');
    expect(created.no).toBe('收-2026-06-001');

    const submitted = await payments.submit(u1, LB_SP, created.id, created.version);
    expect(submitted.status).toBe('pending_approval');

    const approved = await payments.approve(u1, LB_SP, submitted.id, submitted.version);
    expect(approved.status).toBe('approved');

    const confirmed = await payments.confirm(u1, LB_SP, approved.id, approved.version, true);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.settlementVoucher.status).toBe('posted');
    expect(confirmed.settlementVoucher.totalDebit).toBe('1000.00');
    expect(confirmed.settlementVoucher.totalCredit).toBe('1000.00');
    const byAcct = Object.fromEntries(
      confirmed.settlementVoucher.lines.map((l) => [l.accountCode, l]),
    );
    expect(byAcct['1002'].debit).toBe('1000.00');
    expect(byAcct['1122'].credit).toBe('1000.00');
  });

  it('single-person: maker self-confirm without confirmSinglePerson is rejected', async () => {
    const created = await payments.create(u1, LB_SP, receipt);
    const submitted = await payments.submit(u1, LB_SP, created.id, created.version);
    const approved = await payments.approve(u1, LB_SP, submitted.id, submitted.version);
    await expect(
      payments.confirm(u1, LB_SP, approved.id, approved.version, false),
    ).rejects.toThrow();
  });

  it('multi-person SoD: maker cannot approve/confirm own; another user can', async () => {
    const maker: Identity = { ...u1, ledgerBookId: LB_MP };
    const created = await payments.create(maker, LB_MP, receipt);
    const submitted = await payments.submit(maker, LB_MP, created.id, created.version);
    await expect(payments.approve(maker, LB_MP, submitted.id, submitted.version)).rejects.toThrow();
    const approved = await payments.approve(u2, LB_MP, submitted.id, submitted.version);
    expect(approved.status).toBe('approved');
    expect(approved.approver).toBe('u2');
    const confirmed = await payments.confirm(u2, LB_MP, approved.id, approved.version, false);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.settlementVoucher.status).toBe('posted');
  });

  it('rejects a non-cash account as the cash side, and a stale version', async () => {
    await expect(
      payments.create(u1, LB_SP, { ...receipt, cashAccountCode: '1122', contraAccountCode: '1002' }),
    ).rejects.toThrow(); // 1122 is not a 货币资金 account
    const created = await payments.create(u1, LB_SP, receipt);
    await payments.submit(u1, LB_SP, created.id, created.version);
    await expect(payments.submit(u1, LB_SP, created.id, created.version)).rejects.toThrow();
  });

  // ---- Cashier enrichment path (T-012 Phase 3, D3/D7/D8) ----

  it('cashier create enters pending_accounting with null subjects and opens a payment.enrich task', async () => {
    const created = await payments.create(cash, LB_MP, simple);
    expect(created.status).toBe('pending_accounting');
    expect(created.cashAccountCode).toBeNull();
    expect(created.contraAccountCode).toBeNull();

    // work_item is org-scoped (RLS by app.current_org) → query under withScope.
    const items = await withScope(ORG, LB_MP, (tx) =>
      listWorkItemsTx(tx, {
        view: 'supervision',
        actorId: 'x',
        roles: [],
        supervisionCapable: true,
        sourceType: 'PaymentDoc',
        sourceId: created.id,
      }),
    );
    const enrich = items.find((i) => i.workItemType === 'payment.enrich');
    expect(enrich).toBeDefined();
    expect(enrich?.assignedRole).toBe('accountant');
    expect(enrich?.status).toBe('open');
  });

  it('cashier cannot smuggle accounting subjects at create (D3)', async () => {
    await expect(
      payments.create(cash, LB_MP, { ...simple, cashAccountCode: '1002', contraAccountCode: '1122' }),
    ).rejects.toThrow(/出纳建单不填写会计科目/);
  });

  it('a cashier cannot enrich (capability gate, D8)', async () => {
    const created = await payments.create(cash, LB_MP, simple);
    await expect(
      payments.enrich(cash, LB_MP, created.id, {
        expectedVersion: created.version,
        cashAccountCode: '1002',
        contraAccountCode: '1122',
      }),
    ).rejects.toThrow(/仅会计/);
  });

  it('submit rejects an un-enriched (pending_accounting) doc', async () => {
    const created = await payments.create(cash, LB_MP, simple);
    await expect(payments.submit(cash, LB_MP, created.id, created.version)).rejects.toThrow();
  });

  it('enrich fills subjects + aux + cash-flow, advances to pending_approval, and posts NO voucher (D7)', async () => {
    const created = await payments.create(cash, LB_MP, simple);
    const period = created.period;
    const before = await withLedgerScope(LB_MP, (tx) => countVouchersInPeriodTx(tx, period));

    const enriched = await payments.enrich(acc, LB_MP, created.id, {
      expectedVersion: created.version,
      cashAccountCode: '1002',
      contraAccountCode: '1122',
      contraAux: { customer: { id: 'p1', name: '某客户' } },
      cashFlowItem: '0101',
    });
    expect(enriched.status).toBe('pending_approval');
    expect(enriched.cashAccountCode).toBe('1002');
    expect(enriched.contraAccountCode).toBe('1122');
    expect(enriched.settlementVoucherId).toBeNull();

    // D7: enrichment never creates a voucher.
    const after = await withLedgerScope(LB_MP, (tx) => countVouchersInPeriodTx(tx, period));
    expect(after).toBe(before);

    // The enrich task is completed and an approve task opened.
    const items = await withScope(ORG, LB_MP, (tx) =>
      listWorkItemsTx(tx, {
        view: 'supervision',
        actorId: 'x',
        roles: [],
        supervisionCapable: true,
        includeClosed: true,
        sourceType: 'PaymentDoc',
        sourceId: created.id,
      }),
    );
    const enrich = items.find((i) => i.workItemType === 'payment.enrich');
    const approve = items.find((i) => i.workItemType === 'payment.approve');
    expect(enrich?.status).toBe('completed');
    expect(approve?.status).toBe('open');
    expect(approve?.assignedRole).toBe('supervisor');
  });

  it('enrich guards: wrong status, invalid cash subject, stale version', async () => {
    // Wrong status: a direct-path draft is not pending_accounting.
    const draft = await payments.create({ ...u1, ledgerBookId: LB_MP }, LB_MP, receipt);
    await expect(
      payments.enrich(acc, LB_MP, draft.id, {
        expectedVersion: draft.version,
        cashAccountCode: '1002',
        contraAccountCode: '1122',
      }),
    ).rejects.toThrow(/无法补录/);

    const created = await payments.create(cash, LB_MP, simple);
    // Invalid: cash side is not a 货币资金 account.
    await expect(
      payments.enrich(acc, LB_MP, created.id, {
        expectedVersion: created.version,
        cashAccountCode: '1122',
        contraAccountCode: '1002',
      }),
    ).rejects.toThrow(/货币资金/);
    // Stale version.
    await expect(
      payments.enrich(acc, LB_MP, created.id, {
        expectedVersion: created.version + 9,
        cashAccountCode: '1002',
        contraAccountCode: '1122',
      }),
    ).rejects.toThrow();
  });

  it('enrich rejects a closed period', async () => {
    const created = await payments.create({ ...cash, ledgerBookId: LB_PL }, LB_PL, {
      ...simple,
      date: '2026-06-15',
    });
    psql(
      TEST_DB,
      `INSERT INTO "period_close"(id,ledger_book_id,period,status,closed_by,closed_at,updated_at)
       VALUES ('00000000-0000-0000-0000-0000000000fa','${LB_PL}','2026-06','closed','sys',now(),now());`,
    );
    await expect(
      payments.enrich(acc, LB_PL, created.id, {
        expectedVersion: created.version,
        cashAccountCode: '1002',
        contraAccountCode: '1122',
      }),
    ).rejects.toThrow(/已结账/);
  });

  it('full cashier chain: create→enrich→approve→confirm threads aux + cash-flow onto the voucher', async () => {
    const created = await payments.create(cash, LB_MP, simple);
    const enriched = await payments.enrich(acc, LB_MP, created.id, {
      expectedVersion: created.version,
      cashAccountCode: '1002',
      contraAccountCode: '1122',
      contraAux: { customer: { id: 'p1', name: '某客户' } },
      cashFlowItem: '0101',
    });
    // SoD: approver ≠ maker(cashier); confirmer ≠ maker.
    const approved = await payments.approve(sup, LB_MP, enriched.id, enriched.version);
    expect(approved.status).toBe('approved');
    const confirmed = await payments.confirm(acc, LB_MP, approved.id, approved.version, false);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.maker).toBe('cash');
    expect(confirmed.settlementVoucher.status).toBe('posted');

    const contraLine = confirmed.settlementVoucher.lines.find((l) => l.accountCode === '1122');
    expect(contraLine?.cashFlowItem).toBe('0101');
    expect(contraLine?.aux).toEqual({ customer: { id: 'p1', name: '某客户' } });
    // The cash (money) line carries no aux / cash-flow.
    const cashLine = confirmed.settlementVoucher.lines.find((l) => l.accountCode === '1002');
    expect(cashLine?.cashFlowItem).toBeNull();
  });
});
