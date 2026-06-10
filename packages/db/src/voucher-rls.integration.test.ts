/**
 * Postgres RLS + CHECK integration test for P3 vouchers (ledger-scoped). Proves
 * cross-ledger isolation, that lines persist/round-trip, and that the DB CHECK
 * backstops 借贷必平 (a non-draft voucher cannot have unequal totals). Connects
 * as a NON-privileged role; skips without a reachable local Postgres.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createVoucherTx,
  disconnectDatabase,
  getPrisma,
  getVoucherTx,
  listVouchersTx,
  setVoucherStatusTx,
  withLedgerScope,
} from './index';

const PORT = 5432;
const TEST_DB = 'myerp_p3_rls_test';
const APP_ROLE = 'myerp_rls_app';
const APP_PW = 'rls_app_pw';
const ORG = '00000000-0000-0000-0000-0000000000dd';
const LB_A = '00000000-0000-0000-0000-0000000a0001';
const LB_B = '00000000-0000-0000-0000-0000000b0002';

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

const balanced = (lb: string) => ({
  ledgerBookId: lb,
  no: '记-2026-001',
  date: '2026-06-01',
  period: '2026-06',
  summary: '收到投资',
  maker: 'u1',
  totalDebit: '500.00',
  totalCredit: '500.00',
  lines: [
    { accountCode: '1002', accountName: '银行存款', summary: '投资', debit: '500.00', credit: null },
    { accountCode: '4001', accountName: '实收资本', summary: '投资', debit: null, credit: '500.00' },
  ],
});

describe.skipIf(!PG_AVAILABLE)('Postgres RLS + CHECK — journal voucher (ledger-scoped)', () => {
  beforeAll(async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    psql('postgres', `CREATE DATABASE ${TEST_DB};`);
    for (const m of [
      '20260606045750_init',
      '20260610120000_p0b_rls_audit',
      '20260610130000_p1a_org_membership_ledger',
      '20260610140000_p1b_invitation',
      '20260610150000_p2_account',
      '20260610160000_p3_voucher',
    ]) {
      psql(TEST_DB, migrationSql(m));
    }
    psql(
      'postgres',
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${APP_ROLE}') THEN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}'; END IF; END $$;`,
    );
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','A','CNY',2026),('${LB_B}','${ORG}','B','CNY',2026);`,
    );
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PW}@localhost:${PORT}/${TEST_DB}?schema=public`;
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  });

  it('creates a voucher with lines and isolates it by ledger', async () => {
    const v = await withLedgerScope(LB_A, (tx) => createVoucherTx(tx, balanced(LB_A)));
    expect(v.lines).toHaveLength(2);
    expect(v.totalDebit).toBe('500.00');
    expect(v.status).toBe('draft');

    const got = await withLedgerScope(LB_A, (tx) => getVoucherTx(tx, v.id));
    expect(got?.lines.map((l) => l.accountCode)).toEqual(['1002', '4001']);

    const inB = await withLedgerScope(LB_B, (tx) => listVouchersTx(tx));
    expect(inB).toHaveLength(0);
  });

  it('DB CHECK blocks moving an unbalanced voucher out of draft', async () => {
    const v = await withLedgerScope(LB_A, (tx) =>
      createVoucherTx(tx, {
        ...balanced(LB_A),
        no: '记-2026-002',
        totalDebit: '100.00',
        totalCredit: '50.00',
        lines: [
          { accountCode: '1001', accountName: '现金', summary: 'x', debit: '100.00', credit: null },
          { accountCode: '4001', accountName: '资本', summary: 'x', debit: null, credit: '50.00' },
        ],
      }),
    );
    // status='draft' is allowed unbalanced; flipping to pending must violate the CHECK.
    await expect(withLedgerScope(LB_A, (tx) => setVoucherStatusTx(tx, v.id, { status: 'pending' }))).rejects.toThrow();
  });

  it('WITH CHECK blocks creating a voucher in another ledger', async () => {
    await expect(
      withLedgerScope(LB_A, (tx) => createVoucherTx(tx, { ...balanced(LB_B), no: '记-2026-003' })),
    ).rejects.toThrow();
  });

  it('without a ledger scope, RLS hides every voucher', async () => {
    expect(await getPrisma().journalVoucher.findMany()).toHaveLength(0);
  });
});
