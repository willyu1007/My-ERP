/**
 * Postgres RLS integration test — proves ledger-scope isolation on audit_record
 * at the DATABASE layer (not just the app layer). Provisions a throwaway DB on a
 * local Postgres, applies the migrations, and connects as a NON-privileged role
 * (RLS is bypassed by owners/superusers, so this is essential).
 *
 * Skips when no local Postgres is reachable (CI without a PG service); run
 * `pnpm infra:up` or have a local PG on :5432 to exercise it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import { appendAuditRecordTx, disconnectDatabase, getPrisma, withLedgerScope } from './index';

const TEST_DB = 'myerp_p0b_rls_test';

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — ledger isolation on audit_record', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}; GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    // Seed two ledgers as the owner (superuser bypasses RLS).
    psql(
      TEST_DB,
      `INSERT INTO "audit_record"(id,actor_id,action,entity_type,ledger_book_id) VALUES
       (gen_random_uuid(),'seed','SEED','Test','lb-A'),
       (gen_random_uuid(),'seed','SEED','Test','lb-A'),
       (gen_random_uuid(),'seed','SEED','Test','lb-B');`,
    );
    // Point @my-erp/db at the non-privileged role so RLS is enforced.
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
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
      await appendAuditRecordTx(tx, {
        actorId: 'u1',
        action: 'POST',
        entityType: 'Voucher',
        ledgerBookId: 'lb-A',
      });
      return tx.auditRecord.findMany();
    });
    expect(inScope).toHaveLength(3); // 2 seeded + 1 new, all lb-A
    expect(inScope.every((r) => r.ledgerBookId === 'lb-A')).toBe(true);

    const otherScope = await withLedgerScope('lb-B', (tx) => tx.auditRecord.findMany());
    expect(otherScope).toHaveLength(1); // the lb-A write is invisible here
  });
});
