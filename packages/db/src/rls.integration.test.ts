/**
 * Postgres RLS integration test — proves ledger-scope isolation on audit_record
 * at the DATABASE layer (not just the app layer). Provisions a throwaway DB on a
 * local Postgres, applies the migrations, and connects as a NON-privileged role
 * (RLS is bypassed by owners/superusers, so this is essential).
 *
 * Skips when no local Postgres is reachable (CI without a PG service); run
 * `pnpm infra:up` or have a local PG on :5432 to exercise it.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationDirs } from './apply-migrations';
import { appendAuditRecordTx, disconnectDatabase, getPrisma, withLedgerScope } from './index';

const PORT = 5432;
const TEST_DB = 'myerp_p0b_rls_test';
const APP_ROLE = 'myerp_rls_app';
const APP_PW = 'rls_app_pw';

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

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — ledger isolation on audit_record', () => {
  beforeAll(async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE); CREATE DATABASE ${TEST_DB};`);
    // Schema + RLS applied as the privileged owner.
    for (const m of migrationDirs()) psql(TEST_DB, migrationSql(m));
    // Non-superuser app role — RLS only applies to non-owner/non-superuser roles.
    psql(
      'postgres',
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${APP_ROLE}') THEN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}'; END IF; END $$;`,
    );
    psql(TEST_DB, `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}; GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`);
    // Seed two ledgers as the owner (superuser bypasses RLS).
    psql(
      TEST_DB,
      `INSERT INTO "audit_record"(id,actor_id,action,entity_type,ledger_book_id) VALUES
       (gen_random_uuid(),'seed','SEED','Test','lb-A'),
       (gen_random_uuid(),'seed','SEED','Test','lb-A'),
       (gen_random_uuid(),'seed','SEED','Test','lb-B');`,
    );
    // Point @my-erp/db at the non-privileged role so RLS is enforced.
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PW}@localhost:${PORT}/${TEST_DB}?schema=public`;
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  });

  it('a scoped query sees only its own ledger rows', async () => {
    const a = await withLedgerScope('lb-A', (tx) => tx.auditRecord.findMany());
    expect(a).toHaveLength(2);
    expect(a.every((r) => r.ledgerBookId === 'lb-A')).toBe(true);

    const b = await withLedgerScope('lb-B', (tx) => tx.auditRecord.findMany());
    expect(b).toHaveLength(1);
    expect(b[0]?.ledgerBookId).toBe('lb-B');
  });

  it('without a ledger scope set, RLS hides every row (safe default)', async () => {
    const rows = await getPrisma().auditRecord.findMany();
    expect(rows).toHaveLength(0);
  });

  it('an audit write inside a scope is visible only within that scope', async () => {
    const inScope = await withLedgerScope('lb-A', async (tx) => {
      await appendAuditRecordTx(tx, { actorId: 'u1', action: 'POST', entityType: 'Voucher', ledgerBookId: 'lb-A' });
      return tx.auditRecord.findMany();
    });
    expect(inScope).toHaveLength(3); // 2 seeded + 1 new, all lb-A
    expect(inScope.every((r) => r.ledgerBookId === 'lb-A')).toBe(true);

    const otherScope = await withLedgerScope('lb-B', (tx) => tx.auditRecord.findMany());
    expect(otherScope).toHaveLength(1); // the lb-A write is invisible here
  });
});
