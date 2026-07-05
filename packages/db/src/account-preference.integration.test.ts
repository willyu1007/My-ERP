/**
 * Postgres RLS integration test for T-012 AccountPreference: ledger-scoped
 * isolation, the ledger-default ('' userId) vs personal rows, and upsert
 * round-trips. Display-only data — no delete policy needed (clear = empty list).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  disconnectDatabase,
  getAccountPreferenceTx,
  upsertAccountPreferenceTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_t012_account_pref_test';
const ORG = '00000000-0000-0000-0000-00000000004a';
const LB_A = '00000000-0000-0000-0000-0000000000e1';
const LB_B = '00000000-0000-0000-0000-0000000000e2';

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — account_preference (ledger-scoped)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "account_preference" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org Pref');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','Pref Book A','CNY',2026),
         ('${LB_B}','${ORG}','Pref Book B','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('keeps ledger-default and personal rows separate and upserts in place', async () => {
    await withLedgerScope(LB_A, (tx) =>
      upsertAccountPreferenceTx(tx, {
        ledgerBookId: LB_A,
        userId: '',
        recommended: ['1001', '100201', '6602'],
      }),
    );
    await withLedgerScope(LB_A, (tx) =>
      upsertAccountPreferenceTx(tx, {
        ledgerBookId: LB_A,
        userId: 'u1',
        pinned: ['660204'],
        hidden: ['1501', '1511'],
      }),
    );

    const teamDefault = await withLedgerScope(LB_A, (tx) => getAccountPreferenceTx(tx, ''));
    const personal = await withLedgerScope(LB_A, (tx) => getAccountPreferenceTx(tx, 'u1'));
    expect(teamDefault?.recommended).toEqual(['1001', '100201', '6602']);
    expect(teamDefault?.pinned).toEqual([]);
    expect(personal?.pinned).toEqual(['660204']);
    expect(personal?.hidden).toEqual(['1501', '1511']);

    // Partial upsert only touches the provided lists.
    const updated = await withLedgerScope(LB_A, (tx) =>
      upsertAccountPreferenceTx(tx, { ledgerBookId: LB_A, userId: 'u1', pinned: ['1002'] }),
    );
    expect(updated.pinned).toEqual(['1002']);
    expect(updated.hidden).toEqual(['1501', '1511']);
  });

  it('isolates preferences by ledger (RLS)', async () => {
    expect(await withLedgerScope(LB_B, (tx) => getAccountPreferenceTx(tx, ''))).toBeNull();
    expect(await withLedgerScope(LB_B, (tx) => getAccountPreferenceTx(tx, 'u1'))).toBeNull();
  });
});
