/**
 * Integration test for P5 opening balances (期初建账) — replace the set, derive it
 * into the trial balance, and that WITH CHECK blocks cross-ledger writes. Connects
 * as a NON-privileged role; skips without a reachable local Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeTrialBalance } from '@my-erp/finance-domain';
import {
  disconnectDatabase,
  getOpeningBalancesTx,
  replaceOpeningBalancesTx,
  withLedgerScope,
} from './index';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';

const TEST_DB = 'myerp_p5_opening_test';
const ORG = '00000000-0000-0000-0000-0000000000ff';
const LB_A = '00000000-0000-0000-0000-0000000f0001';
const LB_B = '00000000-0000-0000-0000-0000000f0002';

const OPENINGS = [
  { accountCode: '1601', accountName: '固定资产', debit: '80000.00', credit: null },
  { accountCode: '4001', accountName: '实收资本', debit: null, credit: '80000.00' },
];

describe.skipIf(!PG_AVAILABLE)('P5 opening balances (期初建账)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}; GRANT SELECT, INSERT, DELETE ON "opening_balance" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','A','CNY',2026),('${LB_B}','${ORG}','B','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('replaces the opening set and derives it into the trial balance (no postings yet)', async () => {
    await withLedgerScope(LB_A, (tx) => replaceOpeningBalancesTx(tx, LB_A, OPENINGS));
    const openings = await withLedgerScope(LB_A, (tx) => getOpeningBalancesTx(tx));
    expect(openings).toHaveLength(2);

    const tb = computeTrialBalance([], openings);
    expect(tb.balanced.opening).toBe(true);
    expect(tb.balanced.closing).toBe(true);
    const fixed = tb.rows.find((r) => r.accountCode === '1601');
    expect(fixed?.openingDebit).toBe('80000.00');
    expect(fixed?.closingDebit).toBe('80000.00'); // no postings → closing = opening
  });

  it('a replace clears the previous set; another ledger stays empty (isolation)', async () => {
    await withLedgerScope(LB_A, (tx) => replaceOpeningBalancesTx(tx, LB_A, []));
    expect(await withLedgerScope(LB_A, (tx) => getOpeningBalancesTx(tx))).toHaveLength(0);
    expect(await withLedgerScope(LB_B, (tx) => getOpeningBalancesTx(tx))).toHaveLength(0);
  });

  it('WITH CHECK blocks opening balances written for another ledger', async () => {
    await expect(
      withLedgerScope(LB_A, (tx) => replaceOpeningBalancesTx(tx, LB_B, OPENINGS)),
    ).rejects.toThrow();
  });
});
