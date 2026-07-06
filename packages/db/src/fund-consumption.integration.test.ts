/**
 * Postgres RLS integration test for T-012 Phase 4 FundConsumption: ledger-scoped
 * isolation, the version-guarded consume (execution/reconciliation only — never a
 * ledger column), the @@unique([ledgerBookId, voucherLineId]) idempotency guard,
 * per-line partial execution, and reversal void (no physical delete).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  consumeFundConsumptionTx,
  createFundConsumptionTx,
  disconnectDatabase,
  getFundConsumptionTx,
  listFundConsumptionsTx,
  voidFundConsumptionsForVoucherTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_t012_fund_consumption_test';
const ORG = '00000000-0000-0000-0000-00000000005a';
const LB_A = '00000000-0000-0000-0000-0000000005a1';
const LB_B = '00000000-0000-0000-0000-0000000005a2';
const VOUCHER = '00000000-0000-0000-0000-0000000000d0';
const LINE1 = '00000000-0000-0000-0000-0000000000d1';
const LINE2 = '00000000-0000-0000-0000-0000000000d2';

const rowInput = (voucherLineId: string, lineNo: number, direction: string) => ({
  ledgerBookId: LB_A,
  orgId: ORG,
  voucherId: VOUCHER,
  voucherLineId,
  voucherNo: '记-2026-06-001',
  lineNo,
  accountCode: '1002',
  accountName: '银行存款',
  direction,
  amount: '1000.00',
  createdBy: 'acc',
});

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — fund_consumption (ledger-scoped)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "fund_consumption" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org F');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','F Book A','CNY',2026),
         ('${LB_B}','${ORG}','F Book B','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates, lists, and isolates fund consumptions by ledger (RLS)', async () => {
    const row = await withLedgerScope(LB_A, (tx) => createFundConsumptionTx(tx, rowInput(LINE1, 1, 'inflow')));
    expect(row.executionStatus).toBe('pending');
    expect(row.reconciliationStatus).toBe('unreconciled');
    expect(row.amount).toBe('1000.00');
    expect(row.version).toBe(0);

    expect(await withLedgerScope(LB_A, (tx) => listFundConsumptionsTx(tx))).toHaveLength(1);
    expect(await withLedgerScope(LB_B, (tx) => listFundConsumptionsTx(tx))).toHaveLength(0); // RLS
    expect(await withLedgerScope(LB_B, (tx) => getFundConsumptionTx(tx, row.id))).toBeNull();
  });

  it('rejects a second row for the same voucher line (idempotency unique guard)', async () => {
    await expect(
      withLedgerScope(LB_A, (tx) => createFundConsumptionTx(tx, rowInput(LINE1, 1, 'inflow'))),
    ).rejects.toThrow();
  });

  it('consumes with a version guard and writes only execution fields', async () => {
    const [row] = await withLedgerScope(LB_A, (tx) => listFundConsumptionsTx(tx, { voucherId: VOUCHER }));
    if (!row) throw new Error('missing row');

    const stale = await withLedgerScope(LB_A, (tx) =>
      consumeFundConsumptionTx(tx, row.id, {
        expectedVersion: 99,
        executionStatus: 'executed',
        executedBy: 'cash',
        executedAt: new Date('2026-06-12T00:00:00Z'),
      }),
    );
    expect(stale).toBeNull(); // conflict

    const done = await withLedgerScope(LB_A, (tx) =>
      consumeFundConsumptionTx(tx, row.id, {
        expectedVersion: row.version,
        executionStatus: 'executed',
        bankFlowRef: 'BANK-20260612-001',
        reconciliationStatus: 'reconciled',
        executedBy: 'cash',
        executedAt: new Date('2026-06-12T00:00:00Z'),
      }),
    );
    expect(done?.executionStatus).toBe('executed');
    expect(done?.bankFlowRef).toBe('BANK-20260612-001');
    expect(done?.reconciliationStatus).toBe('reconciled');
    expect(done?.reconciledBy).toBe('cash');
    expect(done?.executedBy).toBe('cash');
    expect(done?.version).toBe(row.version + 1);
  });

  it('supports per-line partial execution and reversal void without physical delete', async () => {
    // second cash line on the same voucher → an independent consumable
    await withLedgerScope(LB_A, (tx) => createFundConsumptionTx(tx, rowInput(LINE2, 2, 'outflow')));
    const rows = await withLedgerScope(LB_A, (tx) => listFundConsumptionsTx(tx, { voucherId: VOUCHER }));
    expect(rows).toHaveLength(2);
    // LINE1 already executed; LINE2 still pending (partial execution)
    const byLine = Object.fromEntries(rows.map((r) => [r.voucherLineId, r]));
    expect(byLine[LINE1]?.executionStatus).toBe('executed');
    expect(byLine[LINE2]?.executionStatus).toBe('pending');

    // reversal voids live rows (executed + pending) — no delete
    const voided = await withLedgerScope(LB_A, (tx) => voidFundConsumptionsForVoucherTx(tx, VOUCHER));
    expect(voided).toBe(2);
    const after = await withLedgerScope(LB_A, (tx) => listFundConsumptionsTx(tx, { voucherId: VOUCHER }));
    expect(after).toHaveLength(2); // still present (no physical delete)
    expect(after.every((r) => r.executionStatus === 'void')).toBe(true);
  });
});
