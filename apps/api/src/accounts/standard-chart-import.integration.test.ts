/**
 * Integration test for the standard-chart v2 diff/import engine (T-012 Phase 2, D6):
 * full seed on an empty ledger; safe additive import over a v1 ledger (activity-free
 * leaf parents become branches); posted-leaf conflicts skipped without mutation;
 * idempotent re-import. Skips without a test Postgres.
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
  disconnectDatabase,
  listAccountsTx,
  seedAccountsTx,
  withLedgerScope,
} from '@my-erp/db';
import { STANDARD_CHART } from '@my-erp/platform';
import { applyStandardChartDiffTx, computeStandardChartDiffTx } from './standard-chart-import';

const TEST_DB = 'myerp_t012_chart_import_test';
const ORG = '00000000-0000-0000-0000-00000000003a';
const LB_EMPTY = '00000000-0000-0000-0000-0000000000c1';
const LB_V1 = '00000000-0000-0000-0000-0000000000c2';
const LB_POSTED = '00000000-0000-0000-0000-0000000000c3';

/** The v1 chart as production ledgers have it today (subset; 6602 is a posted leaf later). */
const V1_SUBSET = STANDARD_CHART.filter((a) =>
  ['1001', '1002', '100201', '1122', '2211', '2221', '222101', '4001', '4103', '6001', '6602'].includes(
    a.code,
  ),
).map((a) =>
  // v1 had 2211/6602 as plain leaves (no children yet).
  ['2211', '6602'].includes(a.code) ? { ...a, isLeaf: true } : a,
);

describe.skipIf(!PG_AVAILABLE)('T-012 standard chart v2 import (integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "account" TO ${APP_ROLE};
       GRANT SELECT ON "journal_voucher", "journal_entry_line", "opening_balance" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org Chart');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_EMPTY}','${ORG}','Empty Book','CNY',2026),
         ('${LB_V1}','${ORG}','V1 Book','CNY',2026),
         ('${LB_POSTED}','${ORG}','Posted Book','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('seeds the full v2 chart into an empty ledger with a consistent tree', async () => {
    const seeded = await withLedgerScope(LB_EMPTY, (tx) =>
      seedAccountsTx(tx, LB_EMPTY, STANDARD_CHART),
    );
    expect(seeded).toBe(STANDARD_CHART.length);

    const accounts = await withLedgerScope(LB_EMPTY, (tx) => listAccountsTx(tx));
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    expect(byCode.get('6602')?.isLeaf).toBe(false);
    expect(byCode.get('660201')?.isLeaf).toBe(true);
    expect(byCode.get('660201')?.level).toBe(2);
    expect(byCode.get('222103')?.name).toBe('应交企业所得税');
  });

  it('imports additively over a v1 ledger: activity-free leaf parents become branches', async () => {
    await withLedgerScope(LB_V1, (tx) => seedAccountsTx(tx, LB_V1, V1_SUBSET));

    const result = await withLedgerScope(LB_V1, async (tx) => {
      const diff = await computeStandardChartDiffTx(tx, STANDARD_CHART, await listAccountsTx(tx));
      expect(diff.conflicts).toHaveLength(0);
      expect(diff.parentConversions.map((p) => p.code).sort()).toEqual(['2211', '6602']);
      return applyStandardChartDiffTx(tx, LB_V1, diff);
    });
    expect(result.added).toBe(STANDARD_CHART.length - V1_SUBSET.length);

    const accounts = await withLedgerScope(LB_V1, (tx) => listAccountsTx(tx));
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    expect(byCode.get('6602')?.isLeaf).toBe(false); // converted (no activity)
    expect(byCode.get('660204')?.parentCode).toBe('6602');
    expect(byCode.get('2211')?.isLeaf).toBe(false);
    expect(accounts).toHaveLength(STANDARD_CHART.length);
  });

  it('skips children of a posted leaf as conflicts and never mutates it', async () => {
    await withLedgerScope(LB_POSTED, (tx) => seedAccountsTx(tx, LB_POSTED, V1_SUBSET));
    // Give 6602 an opening balance directly (superuser psql bypasses RLS).
    psql(
      TEST_DB,
      `INSERT INTO "opening_balance"(id,ledger_book_id,account_code,account_name,debit)
       VALUES ('00000000-0000-0000-0000-0000000000d9','${LB_POSTED}','6602','管理费用',100.00);`,
    );

    const result = await withLedgerScope(LB_POSTED, async (tx) => {
      const diff = await computeStandardChartDiffTx(tx, STANDARD_CHART, await listAccountsTx(tx));
      expect(diff.conflicts.length).toBeGreaterThan(0);
      expect(diff.conflicts.every((c) => c.code.startsWith('6602'))).toBe(true);
      expect(diff.parentConversions.map((p) => p.code)).toEqual(['2211']);
      return applyStandardChartDiffTx(tx, LB_POSTED, diff);
    });
    expect(result.conflicts.length).toBe(11); // the 6602xx children

    const accounts = await withLedgerScope(LB_POSTED, (tx) => listAccountsTx(tx));
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    expect(byCode.get('6602')?.isLeaf).toBe(true); // untouched
    expect(byCode.get('660201')).toBeUndefined(); // children skipped
    expect(byCode.get('221101')?.parentCode).toBe('2211'); // safe conversion applied
  });

  it('is idempotent: a second import adds nothing new', async () => {
    const result = await withLedgerScope(LB_V1, async (tx) => {
      const diff = await computeStandardChartDiffTx(tx, STANDARD_CHART, await listAccountsTx(tx));
      return applyStandardChartDiffTx(tx, LB_V1, diff);
    });
    expect(result.added).toBe(0);
    expect(result.convertedParents).toBe(0);
  });
});
