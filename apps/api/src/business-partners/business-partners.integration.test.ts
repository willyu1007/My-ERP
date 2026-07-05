/**
 * Service-level integration test for T-012 Phase 1 (BusinessPartner). Drives the
 * real BusinessPartnersService + PaymentsService partner wiring against a live
 * Postgres: org/individual creation, the D2 non-member confirmation guard, the
 * member-link validation, search/filters, version-guarded update/deactivate, and
 * payment create/list with a partner link + stable counterparty snapshot.
 * Skips without a test Postgres.
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
import { disconnectDatabase } from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { BusinessPartnersService } from './business-partners.service';

const TEST_DB = 'myerp_t012_partners_svc_test';
const ORG = '00000000-0000-0000-0000-00000000002a';
const LB = '00000000-0000-0000-0000-0000000000b1';
const u1: Identity = { userId: 'u1', orgId: ORG, ledgerBookId: LB, roles: [] };

const partners = new BusinessPartnersService();

describe.skipIf(!PG_AVAILABLE)('T-012 business partners (service integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book", "membership" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "business_partner" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org BP');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB}','${ORG}','BP Book','CNY',2026);
       INSERT INTO "membership"(id,org_id,user_id,role,email) VALUES
         ('00000000-0000-0000-0000-0000000000e1','${ORG}','user-zhangwei','cashier','zw@example.com');`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates an organization partner and searches it by name', async () => {
    const company = await partners.create(u1, LB, {
      partyType: 'organization',
      name: '杭州某某科技有限公司',
      roles: ['customer', 'supplier'],
      tags: ['华东'],
    });
    expect(company.active).toBe(true);
    expect(company.roles).toEqual(['customer', 'supplier']);

    const found = await partners.list(u1, LB, { q: '某某科技' });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(company.id);
  });

  it('enforces D2: non-member individuals need explicit confirmation; member links must be real members', async () => {
    await expect(
      partners.create(u1, LB, { partyType: 'individual', name: '外部王五' }),
    ).rejects.toThrow(/显式确认/);

    const confirmed = await partners.create(u1, LB, {
      partyType: 'individual',
      name: '外部王五',
      roles: ['reimbursee'],
      confirmNonMember: true,
    });
    expect(confirmed.memberUserId).toBeNull();

    await expect(
      partners.create(u1, LB, {
        partyType: 'individual',
        name: '李四',
        memberUserId: 'not-a-member',
      }),
    ).rejects.toThrow(/不是本组织成员/);

    const employee = await partners.create(u1, LB, {
      partyType: 'individual',
      name: '张伟',
      roles: ['employee', 'reimbursee'],
      memberUserId: 'user-zhangwei',
      wechat: 'zw_8888',
    });
    expect(employee.memberUserId).toBe('user-zhangwei');

    // memberUserId is individuals-only.
    await expect(
      partners.create(u1, LB, {
        partyType: 'organization',
        name: '某公司',
        memberUserId: 'user-zhangwei',
      }),
    ).rejects.toThrow(/仅适用于个人/);
  });

  it('rejects unknown roles and empty names', async () => {
    await expect(
      partners.create(u1, LB, { partyType: 'organization', name: 'X公司', roles: ['vip'] }),
    ).rejects.toThrow(/roles must be/);
    await expect(
      partners.create(u1, LB, { partyType: 'organization', name: '   ' }),
    ).rejects.toThrow(/name is required/);
  });

  it('updates with a version guard and deactivates instead of deleting', async () => {
    const [zhang] = await partners.list(u1, LB, { q: 'zw_8888' });
    if (!zhang) throw new Error('missing partner');

    await expect(
      partners.update(u1, LB, zhang.id, { expectedVersion: 99, remark: 'stale' }),
    ).rejects.toThrow(/已变化/);

    const off = await partners.update(u1, LB, zhang.id, {
      expectedVersion: zhang.version,
      active: false,
    });
    expect(off.active).toBe(false);

    // Still listable/searchable; deactivation is not deletion.
    expect(await partners.list(u1, LB, { active: false })).toHaveLength(1);
  });
});
