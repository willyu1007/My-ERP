/**
 * Postgres RLS integration test for T-012 BusinessPartner: ledger-scoped CRUD,
 * isolation, search/filters, the optimistic (version-guarded) update, and the
 * partnerId dimension — payment/contract rows filter by partner while their
 * counterparty text stays a stable snapshot after partner renames.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  createBusinessPartnerTx,
  createContractTx,
  createPaymentDocTx,
  disconnectDatabase,
  getBusinessPartnerTx,
  getPaymentDocTx,
  listBusinessPartnersTx,
  listContractsTx,
  listPaymentDocsTx,
  updateBusinessPartnerTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_t012_business_partner_test';
const ORG = '00000000-0000-0000-0000-00000000001a';
const LB_A = '00000000-0000-0000-0000-0000000000a1';
const LB_B = '00000000-0000-0000-0000-0000000000a2';

describe.skipIf(!PG_AVAILABLE)(
  'Postgres RLS — business_partner (ledger-scoped) + partnerId dimension',
  () => {
    beforeAll(async () => {
      createTestDb(TEST_DB);
      psql(
        TEST_DB,
        `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "business_partner" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "contract" TO ${APP_ROLE};`,
      );
      psql(
        TEST_DB,
        `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org P');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','P Book A','CNY',2026),
         ('${LB_B}','${ORG}','P Book B','CNY',2026);`,
      );
      process.env.DATABASE_URL = appDbUrl(TEST_DB);
      await disconnectDatabase();
    }, 60_000);

    afterAll(async () => {
      await disconnectDatabase();
      dropTestDb(TEST_DB);
    });

    it('creates, lists, and isolates partners by ledger', async () => {
      const company = await withLedgerScope(LB_A, (tx) =>
        createBusinessPartnerTx(tx, {
          ledgerBookId: LB_A,
          partyType: 'organization',
          name: '杭州某某科技有限公司',
          roles: ['customer', 'supplier'],
          tags: ['华东'],
          createdBy: 'u1',
        }),
      );
      expect(company.active).toBe(true);
      expect(company.version).toBe(0);
      expect(company.roles).toEqual(['customer', 'supplier']);

      await withLedgerScope(LB_A, (tx) =>
        createBusinessPartnerTx(tx, {
          ledgerBookId: LB_A,
          partyType: 'individual',
          name: '张伟',
          roles: ['employee', 'reimbursee'],
          memberUserId: 'user-zhangwei',
          wechat: 'zw_8888',
          createdBy: 'u1',
        }),
      );

      expect(await withLedgerScope(LB_A, (tx) => listBusinessPartnersTx(tx))).toHaveLength(2);
      expect(await withLedgerScope(LB_B, (tx) => listBusinessPartnersTx(tx))).toHaveLength(0); // RLS isolation
      expect(await withLedgerScope(LB_B, (tx) => getBusinessPartnerTx(tx, company.id))).toBeNull();
    });

    it('searches by name/wechat and filters by role/partyType/active', async () => {
      const byName = await withLedgerScope(LB_A, (tx) =>
        listBusinessPartnersTx(tx, { q: '张伟' }),
      );
      expect(byName).toHaveLength(1);
      expect(byName[0]?.partyType).toBe('individual');

      const byWechat = await withLedgerScope(LB_A, (tx) =>
        listBusinessPartnersTx(tx, { q: 'zw_8888' }),
      );
      expect(byWechat).toHaveLength(1);
      expect(byWechat[0]?.name).toBe('张伟');

      expect(
        await withLedgerScope(LB_A, (tx) => listBusinessPartnersTx(tx, { role: 'customer' })),
      ).toHaveLength(1);
      expect(
        await withLedgerScope(LB_A, (tx) =>
          listBusinessPartnersTx(tx, { partyType: 'individual' }),
        ),
      ).toHaveLength(1);
      expect(
        await withLedgerScope(LB_A, (tx) => listBusinessPartnersTx(tx, { active: false })),
      ).toHaveLength(0);
    });

    it('updates with a version guard and deactivates instead of deleting', async () => {
      const [zhang] = await withLedgerScope(LB_A, (tx) =>
        listBusinessPartnersTx(tx, { q: '张伟' }),
      );
      if (!zhang) throw new Error('missing partner');

      const stale = await withLedgerScope(LB_A, (tx) =>
        updateBusinessPartnerTx(tx, zhang.id, { expectedVersion: 99, remark: 'nope' }),
      );
      expect(stale).toBeNull(); // optimistic conflict

      const updated = await withLedgerScope(LB_A, (tx) =>
        updateBusinessPartnerTx(tx, zhang.id, {
          expectedVersion: zhang.version,
          active: false,
          tags: ['离职'],
        }),
      );
      expect(updated?.active).toBe(false);
      expect(updated?.version).toBe(zhang.version + 1);

      // Deactivated partners stay findable (no physical delete) and searchable.
      expect(
        await withLedgerScope(LB_A, (tx) => listBusinessPartnersTx(tx, { q: '张伟' })),
      ).toHaveLength(1);
    });

    it('filters payments/contracts by partnerId while counterparty stays a snapshot', async () => {
      const partner = await withLedgerScope(LB_A, (tx) =>
        createBusinessPartnerTx(tx, {
          ledgerBookId: LB_A,
          partyType: 'organization',
          name: '北京供应商A',
          roles: ['supplier'],
          createdBy: 'u1',
        }),
      );

      const payment = await withLedgerScope(LB_A, (tx) =>
        createPaymentDocTx(tx, {
          ledgerBookId: LB_A,
          no: '付-2026-06-001',
          direction: 'payment',
          date: '2026-06-10',
          period: '2026-06',
          counterparty: '北京供应商A',
          partnerId: partner.id,
          summary: '采购付款',
          amount: '1200.00',
          cashAccountCode: '1002',
          contraAccountCode: '2202',
          maker: 'u1',
        }),
      );
      await withLedgerScope(LB_A, (tx) =>
        createContractTx(tx, {
          ledgerBookId: LB_A,
          code: 'HT-2026-001',
          title: '采购合同',
          type: 'purchase',
          counterparty: '北京供应商A',
          partnerId: partner.id,
          createdBy: 'u1',
        }),
      );

      expect(
        await withLedgerScope(LB_A, (tx) => listPaymentDocsTx(tx, { partnerId: partner.id })),
      ).toHaveLength(1);
      expect(
        await withLedgerScope(LB_A, (tx) => listContractsTx(tx, { partnerId: partner.id })),
      ).toHaveLength(1);
      expect(
        await withLedgerScope(LB_A, (tx) =>
          listPaymentDocsTx(tx, { partnerId: '00000000-0000-0000-0000-0000000000ff' }),
        ),
      ).toHaveLength(0);

      // Rename the partner master — the document snapshot must not move.
      await withLedgerScope(LB_A, (tx) =>
        updateBusinessPartnerTx(tx, partner.id, {
          expectedVersion: partner.version,
          name: '北京供应商A（更名后）',
        }),
      );
      const after = await withLedgerScope(LB_A, (tx) => getPaymentDocTx(tx, payment.id));
      expect(after?.counterparty).toBe('北京供应商A');
      expect(after?.partnerId).toBe(partner.id);
    });
  },
);
