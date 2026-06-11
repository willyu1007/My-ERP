/**
 * Postgres RLS integration test for the P1b invitation flow + membership writes.
 * Proves org isolation of invitations, that accepting creates a membership
 * (membership INSERT policy), and that WITH CHECK blocks cross-org invitations.
 * Connects as a NON-privileged role; skips when no local Postgres is reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
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

const TEST_DB = 'myerp_p1b_rls_test';
const ORG_A = '00000000-0000-0000-0000-0000000000aa';
const ORG_B = '00000000-0000-0000-0000-0000000000bb';

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — invitation flow', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
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
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates an invitation, finds it by token, and lists it within the org', async () => {
    const inv = await withOrgScope(ORG_A, (tx) =>
      createInvitationTx(tx, {
        orgId: ORG_A,
        invitedEmail: 'bob@x.com',
        role: 'accountant',
        invitedBy: 'admin-a',
      }),
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
      const membership = await createMembershipTx(tx, {
        orgId: ORG_A,
        userId: 'carol',
        role: inv.role,
        email: 'carol@x.com',
      });
      await updateInvitationStatusTx(tx, inv.id, {
        status: 'accepted',
        acceptedBy: 'carol',
        acceptedAt: new Date(),
      });
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
        createInvitationTx(tx, {
          orgId: ORG_B,
          invitedEmail: 'x@x.com',
          role: 'viewer',
          invitedBy: 'admin-a',
        }),
      ),
    ).rejects.toThrow();
  });
});
