/**
 * Postgres RLS integration test for T-007 PaymentDoc: ledger-scoped CRUD,
 * cross-ledger isolation, and the optimistic (version-guarded) status update.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  countPaymentDocsInPeriodTx,
  createPaymentDocTx,
  disconnectDatabase,
  getPaymentDocTx,
  listPaymentDocsTx,
  updatePaymentDocTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_t007_payment_doc_test';
const ORG = '00000000-0000-0000-0000-00000000000c';
const LB_A = '00000000-0000-0000-0000-0000000000c1';
const LB_B = '00000000-0000-0000-0000-0000000000c2';

const input = (no: string) => ({
  ledgerBookId: LB_A,
  no,
  direction: 'receipt',
  date: '2026-06-10',
  period: '2026-06',
  counterparty: '某客户',
  summary: '收回货款',
  amount: '1000.00',
  cashAccountCode: '1002',
  contraAccountCode: '1122',
  maker: 'maker-a',
});

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — payment doc (ledger-scoped)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org C');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','C Book A','CNY',2026),
         ('${LB_B}','${ORG}','C Book B','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates, lists, and isolates payment docs by ledger', async () => {
    const created = await withLedgerScope(LB_A, (tx) => createPaymentDocTx(tx, input('收-2026-06-001')));
    expect(created.status).toBe('draft');
    expect(created.amount).toBe('1000.00');
    expect(created.date).toBe('2026-06-10');
    expect(created.version).toBe(0);

    expect(await withLedgerScope(LB_A, (tx) => listPaymentDocsTx(tx))).toHaveLength(1);
    expect(await withLedgerScope(LB_B, (tx) => listPaymentDocsTx(tx))).toHaveLength(0); // RLS isolation
    expect((await withLedgerScope(LB_A, (tx) => getPaymentDocTx(tx, created.id)))?.no).toBe(
      '收-2026-06-001',
    );
    expect(
      await withLedgerScope(LB_A, (tx) => countPaymentDocsInPeriodTx(tx, '2026-06', 'receipt')),
    ).toBe(1);
  });

  it('optimistic update bumps version; a stale version conflicts (null)', async () => {
    const created = await withLedgerScope(LB_A, (tx) => createPaymentDocTx(tx, input('收-2026-06-002')));

    const approved = await withLedgerScope(LB_A, (tx) =>
      updatePaymentDocTx(tx, created.id, { expectedVersion: 0, status: 'approved', approver: 'sup-a' }),
    );
    expect(approved?.status).toBe('approved');
    expect(approved?.version).toBe(1);

    // Re-using the now-stale version 0 must conflict.
    const stale = await withLedgerScope(LB_A, (tx) =>
      updatePaymentDocTx(tx, created.id, { expectedVersion: 0, status: 'confirmed' }),
    );
    expect(stale).toBeNull();
  });
});
