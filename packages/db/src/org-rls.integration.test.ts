/**
 * Postgres RLS integration test for the P1a org-scoped tables (organization /
 * membership / ledger_book). Proves cross-org isolation at the DB layer and that
 * WITH CHECK blocks cross-org writes. Connects as a NON-privileged role (RLS is
 * bypassed by owners/superusers). Skips when no local Postgres is reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  createLedgerBookTx,
  disconnectDatabase,
  getPrisma,
  listLedgerBooksTx,
  listMembershipRolesTx,
  withOrgScope,
} from './index';

const TEST_DB = 'myerp_p1a_rls_test';
const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

describe.skipIf(!PG_AVAILABLE)(
  'Postgres RLS — org isolation (organization/membership/ledger_book)',
  () => {
    beforeAll(async () => {
      createTestDb(TEST_DB);
      psql(
        TEST_DB,
        `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "membership" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "ledger_book" TO ${APP_ROLE};`,
      );
      // Seed two orgs as the owner (superuser bypasses RLS).
      psql(
        TEST_DB,
        `INSERT INTO "organization"(id,name) VALUES ('${ORG_A}','Org A'),('${ORG_B}','Org B');
       INSERT INTO "membership"(id,org_id,user_id,role) VALUES
         (gen_random_uuid(),'${ORG_A}','user-a','accountant'),
         (gen_random_uuid(),'${ORG_B}','user-b','admin');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         (gen_random_uuid(),'${ORG_A}','A Book 1','CNY',2026),
         (gen_random_uuid(),'${ORG_A}','A Book 2','CNY',2026),
         (gen_random_uuid(),'${ORG_B}','B Book','CNY',2026);`,
      );
      process.env.DATABASE_URL = appDbUrl(TEST_DB);
      await disconnectDatabase();
    }, 60_000);

    afterAll(async () => {
      await disconnectDatabase();
      dropTestDb(TEST_DB);
    });

    it('ledger books are isolated by org scope', async () => {
      const a = await withOrgScope(ORG_A, (tx) => listLedgerBooksTx(tx));
      expect(a).toHaveLength(2);
      expect(a.every((b) => b.orgId === ORG_A)).toBe(true);

      const b = await withOrgScope(ORG_B, (tx) => listLedgerBooksTx(tx));
      expect(b).toHaveLength(1);
      expect(b[0]?.name).toBe('B Book');
    });

    it('membership roles resolve only within the active org', async () => {
      const inA = await withOrgScope(ORG_A, (tx) => listMembershipRolesTx(tx, 'user-a'));
      expect(inA).toEqual(['accountant']);
      // user-b's membership lives in Org B → invisible under Org A scope.
      const bUnderA = await withOrgScope(ORG_A, (tx) => listMembershipRolesTx(tx, 'user-b'));
      expect(bUnderA).toEqual([]);
    });

    it('WITH CHECK blocks creating a ledger book for another org', async () => {
      await expect(
        withOrgScope(ORG_A, (tx) =>
          createLedgerBookTx(tx, {
            orgId: ORG_B,
            name: 'sneaky',
            baseCurrency: 'CNY',
            fiscalYear: 2026,
          }),
        ),
      ).rejects.toThrow();
    });

    it('a create within the active org succeeds and is isolated', async () => {
      const created = await withOrgScope(ORG_A, (tx) =>
        createLedgerBookTx(tx, {
          orgId: ORG_A,
          name: 'A Book 3',
          baseCurrency: 'CNY',
          fiscalYear: 2026,
        }),
      );
      expect(created.orgId).toBe(ORG_A);
      const a = await withOrgScope(ORG_A, (tx) => listLedgerBooksTx(tx));
      expect(a).toHaveLength(3);
    });

    it('without an org scope, RLS hides every row', async () => {
      const rows = await getPrisma().ledgerBook.findMany();
      expect(rows).toHaveLength(0);
    });
  },
);
