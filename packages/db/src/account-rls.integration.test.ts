/**
 * Postgres RLS integration test for P2 accounts (ledger-scoped). Proves
 * cross-ledger isolation, idempotent seeding, and that WITH CHECK blocks
 * cross-ledger writes. Connects as a NON-privileged role; skips without a
 * reachable local Postgres.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAccountTx,
  disconnectDatabase,
  getPrisma,
  listAccountsTx,
  seedAccountsTx,
  withLedgerScope,
  type SeedAccountInput,
} from './index';

const PORT = 5432;
const TEST_DB = 'myerp_p2_rls_test';
const APP_ROLE = 'myerp_rls_app';
const APP_PW = 'rls_app_pw';
const ORG = '00000000-0000-0000-0000-0000000000cc';
const LB_A = '00000000-0000-0000-0000-00000000aaaa';
const LB_B = '00000000-0000-0000-0000-00000000bbbb';

const SEEDS: readonly SeedAccountInput[] = [
  { code: '1001', name: '库存现金', category: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: true },
  { code: '1002', name: '银行存款', category: 'asset', direction: 'debit', parentCode: null, level: 1, isLeaf: false },
  { code: '100201', name: '工商银行', category: 'asset', direction: 'debit', parentCode: '1002', level: 2, isLeaf: true },
];

function pgAvailable(): boolean {
  try {
    execSync(`pg_isready -p ${PORT}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const PG_AVAILABLE = pgAvailable();

function psql(db: string, sql: string): void {
  execSync(`psql -p ${PORT} -d ${db} -v ON_ERROR_STOP=1 -q`, { input: sql, stdio: ['pipe', 'ignore', 'pipe'] });
}
function migrationSql(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../prisma/migrations/${name}/migration.sql`, import.meta.url)),
    'utf8',
  );
}

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — account (ledger-scoped)', () => {
  beforeAll(async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    psql('postgres', `CREATE DATABASE ${TEST_DB};`);
    for (const m of [
      '20260606045750_init',
      '20260610120000_p0b_rls_audit',
      '20260610130000_p1a_org_membership_ledger',
      '20260610140000_p1b_invitation',
      '20260610150000_p2_account',
    ]) {
      psql(TEST_DB, migrationSql(m));
    }
    psql(
      'postgres',
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${APP_ROLE}') THEN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}'; END IF; END $$;`,
    );
    psql(TEST_DB, `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}; GRANT SELECT, INSERT, UPDATE ON "account" TO ${APP_ROLE};`);
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','Book A','CNY',2026),('${LB_B}','${ORG}','Book B','CNY',2026);`,
    );
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PW}@localhost:${PORT}/${TEST_DB}?schema=public`;
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  });

  it('seeds + lists accounts isolated by ledger scope', async () => {
    const seeded = await withLedgerScope(LB_A, (tx) => seedAccountsTx(tx, LB_A, SEEDS));
    expect(seeded).toBe(3);

    const a = await withLedgerScope(LB_A, (tx) => listAccountsTx(tx));
    expect(a).toHaveLength(3);
    expect(a.map((x) => x.code)).toEqual(['1001', '1002', '100201']); // code order

    const b = await withLedgerScope(LB_B, (tx) => listAccountsTx(tx));
    expect(b).toHaveLength(0);
  });

  it('seeding is idempotent (skips existing codes)', async () => {
    const again = await withLedgerScope(LB_A, (tx) => seedAccountsTx(tx, LB_A, SEEDS));
    expect(again).toBe(0);
    const a = await withLedgerScope(LB_A, (tx) => listAccountsTx(tx));
    expect(a).toHaveLength(3);
  });

  it('WITH CHECK blocks creating an account in another ledger', async () => {
    await expect(
      withLedgerScope(LB_A, (tx) =>
        createAccountTx(tx, { ledgerBookId: LB_B, code: '9999', name: 'x', category: 'asset', direction: 'debit', level: 1 }),
      ),
    ).rejects.toThrow();
  });

  it('without a ledger scope, RLS hides every account', async () => {
    const rows = await getPrisma().account.findMany();
    expect(rows).toHaveLength(0);
  });
});
