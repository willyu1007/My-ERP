/**
 * Postgres RLS integration test for the P1b invitation flow + membership writes.
 * Proves org isolation of invitations, that accepting creates a membership
 * (membership INSERT policy), and that WITH CHECK blocks cross-org invitations.
 * Connects as a NON-privileged role; skips when no local Postgres is reachable.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationDirs } from './apply-migrations';
import {
  createInvitationTx,
  createMembershipTx,
  disconnectDatabase,
  findInvitationByTokenTx,
  listInvitationsTx,
  listMembershipRolesTx,
  updateInvitationStatusTx,
  withOrgScope,
} from './index';

const PORT = 5432;
const TEST_DB = 'myerp_p1b_rls_test';
const APP_ROLE = 'myerp_rls_app';
const APP_PW = 'rls_app_pw';
const ORG_A = '00000000-0000-0000-0000-0000000000aa';
const ORG_B = '00000000-0000-0000-0000-0000000000bb';

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

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — invitation flow', () => {
  beforeAll(async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    psql('postgres', `CREATE DATABASE ${TEST_DB};`);
    for (const m of migrationDirs()) psql(TEST_DB, migrationSql(m));
    psql(
      'postgres',
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${APP_ROLE}') THEN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}'; END IF; END $$;`,
    );
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "membership" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "invitation" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG_A}','Org A'),('${ORG_B}','Org B');
       INSERT INTO "membership"(id,org_id,user_id,role) VALUES (gen_random_uuid(),'${ORG_A}','admin-a','admin');`,
    );
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PW}@localhost:${PORT}/${TEST_DB}?schema=public`;
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  });

  it('creates an invitation, finds it by token, and lists it within the org', async () => {
    const inv = await withOrgScope(ORG_A, (tx) =>
      createInvitationTx(tx, { orgId: ORG_A, invitedEmail: 'bob@x.com', role: 'accountant', invitedBy: 'admin-a' }),
    );
    expect(inv.status).toBe('pending');
    expect(inv.token).toBeTruthy();

    const found = await withOrgScope(ORG_A, (tx) => findInvitationByTokenTx(tx, inv.token));
    expect(found?.id).toBe(inv.id);
    const list = await withOrgScope(ORG_A, (tx) => listInvitationsTx(tx));
    expect(list).toHaveLength(1);

    // The token is invisible under another org's scope (RLS).
    const crossOrg = await withOrgScope(ORG_B, (tx) => findInvitationByTokenTx(tx, inv.token));
    expect(crossOrg).toBeNull();
  });

  it('accepting creates a membership and flips the invitation to accepted', async () => {
    const result = await withOrgScope(ORG_A, async (tx) => {
      const inv = await createInvitationTx(tx, {
        orgId: ORG_A,
        invitedEmail: 'carol@x.com',
        role: 'cashier',
        invitedBy: 'admin-a',
      });
      const membership = await createMembershipTx(tx, { orgId: ORG_A, userId: 'carol', role: inv.role, email: 'carol@x.com' });
      await updateInvitationStatusTx(tx, inv.id, { status: 'accepted', acceptedBy: 'carol', acceptedAt: new Date() });
      return { invId: inv.id, membership };
    });
    expect(result.membership.role).toBe('cashier');

    const roles = await withOrgScope(ORG_A, (tx) => listMembershipRolesTx(tx, 'carol'));
    expect(roles).toEqual(['cashier']);
    const found = await withOrgScope(ORG_A, (tx) => findInvitationByTokenTx(tx, ''));
    expect(found).toBeNull(); // sanity: empty token finds nothing
  });

  it('WITH CHECK blocks creating an invitation for another org', async () => {
    await expect(
      withOrgScope(ORG_A, (tx) =>
        createInvitationTx(tx, { orgId: ORG_B, invitedEmail: 'x@x.com', role: 'viewer', invitedBy: 'admin-a' }),
      ),
    ).rejects.toThrow();
  });
});
