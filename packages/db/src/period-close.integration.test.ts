/**
 * Postgres RLS integration test for T-006 PeriodClose: ledger-scoped close/reopen,
 * isolation by ledger, and the unposted-voucher readiness count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  closePeriodTx,
  countUnpostedVouchersInPeriodTx,
  disconnectDatabase,
  getPeriodCloseTx,
  isPeriodClosedTx,
  reopenPeriodTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_t006_period_close_test';
const ORG = '00000000-0000-0000-0000-00000000000a';
const LB_A = '00000000-0000-0000-0000-0000000000a1';
const LB_B = '00000000-0000-0000-0000-0000000000b1';

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — period close (ledger-scoped)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book", "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "period_close" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org A');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','A Book','CNY',2026),
         ('${LB_B}','${ORG}','B Book','CNY',2026);
       INSERT INTO "journal_voucher"(id,ledger_book_id,no,date,period,status,summary,maker)
         VALUES ('00000000-0000-0000-0000-0000000000f1','${LB_A}','记-2026-07-001','2026-07-10','2026-07','draft','测试','u');`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('closes a period, isolates it by ledger, and reopens', async () => {
    const closed = await withLedgerScope(LB_A, (tx) =>
      closePeriodTx(tx, {
        ledgerBookId: LB_A,
        period: '2026-06',
        closeVoucherId: null,
        closedBy: 'u',
      }),
    );
    expect(closed.status).toBe('closed');
    expect(await withLedgerScope(LB_A, (tx) => isPeriodClosedTx(tx, '2026-06'))).toBe(true);

    // RLS: another ledger cannot see it
    expect(await withLedgerScope(LB_B, (tx) => getPeriodCloseTx(tx, '2026-06'))).toBeNull();
    expect(await withLedgerScope(LB_B, (tx) => isPeriodClosedTx(tx, '2026-06'))).toBe(false);

    const reopened = await withLedgerScope(LB_A, (tx) =>
      reopenPeriodTx(tx, { period: '2026-06', reopenedBy: 'u' }),
    );
    expect(reopened?.status).toBe('open');
    expect(await withLedgerScope(LB_A, (tx) => isPeriodClosedTx(tx, '2026-06'))).toBe(false);
  });

  it('counts unposted vouchers for close-readiness', async () => {
    expect(
      await withLedgerScope(LB_A, (tx) => countUnpostedVouchersInPeriodTx(tx, '2026-07')),
    ).toBe(1);
    expect(
      await withLedgerScope(LB_A, (tx) => countUnpostedVouchersInPeriodTx(tx, '2026-08')),
    ).toBe(0);
  });
});
