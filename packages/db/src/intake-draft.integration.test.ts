/**
 * Integration test for the T-004 S5 auto-draft persistence chain: an extracted
 * intake becomes a voucher draft + a voucher.confirm work item, version-guarded
 * (one-shot extracted → drafted). Exercises the db primitives the IntakeService
 * composes, under org+ledger RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  createIntakeTx,
  createVoucherTx,
  createWorkItemWithResultTx,
  disconnectDatabase,
  getVoucherTx,
  updateIntakeTx,
  withScope,
} from './index';

const TEST_DB = 'myerp_t004_intake_draft_test';
const ORG = '00000000-0000-0000-0000-00000000000a';
const LB = '00000000-0000-0000-0000-0000000000a1';

describe.skipIf(!PG_AVAILABLE)('T-004 capture → draft persistence chain', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "intake" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "journal_voucher", "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "work_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "work_item_event" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org A');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year)
         VALUES ('${LB}','${ORG}','A Book','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('drafts a voucher + confirm work item from an extracted intake, one-shot', async () => {
    const result = await withScope(ORG, LB, async (tx) => {
      // capture → extracted
      const received = await createIntakeTx(tx, {
        orgId: ORG,
        ledgerBookId: LB,
        kind: 'image',
        createdBy: 'accountant-a',
      });
      const extracted = await updateIntakeTx(tx, received.id, {
        status: 'extracted',
        extraction: { docType: 'bank_slip', amount: '1234.56' },
        confidence: 0.95,
        needsReview: false,
        expectedVersion: received.version,
      });
      expect(extracted?.status).toBe('extracted');

      // draft: persist the bank line (contra left for the human) + mark drafted (one-shot)
      const voucher = await createVoucherTx(tx, {
        ledgerBookId: LB,
        no: '记-2026-06-001',
        date: '2026-06-15',
        period: '2026-06',
        summary: '银行收款',
        maker: 'accountant-a',
        totalDebit: '1234.56',
        totalCredit: '0.00',
        lines: [
          { accountCode: '1002', accountName: '银行存款', summary: '银行收款', debit: '1234.56', credit: null },
        ],
      });
      const drafted = await updateIntakeTx(tx, received.id, {
        status: 'drafted',
        targetType: 'JournalVoucher',
        targetId: voucher.id,
        expectedVersion: extracted!.version,
      });
      const confirm = await createWorkItemWithResultTx(tx, {
        orgId: ORG,
        ledgerBookId: LB,
        moduleKey: 'finance',
        workflowKey: 'daily-accounting',
        workflowVersion: 'v1',
        workItemType: 'voucher.confirm',
        sourceType: 'JournalVoucher',
        sourceId: voucher.id,
        dedupeKey: `finance:daily-accounting:voucher.confirm:${voucher.id}`,
        status: 'open',
        subStatus: 'pending_completion',
        assignedRole: 'accountant',
        createdBy: 'accountant-a',
        titleKey: 'finance.voucher.confirm',
      });

      // a second draft attempt at the now-stale version must not fire (one-shot)
      const replay = await updateIntakeTx(tx, received.id, {
        status: 'drafted',
        expectedVersion: extracted!.version,
      });

      return { intakeId: received.id, voucherId: voucher.id, drafted, confirm, replay };
    });

    expect(result.drafted?.status).toBe('drafted');
    expect(result.drafted?.targetType).toBe('JournalVoucher');
    expect(result.drafted?.targetId).toBe(result.voucherId);
    expect(result.confirm.created).toBe(true);
    expect(result.confirm.item.workItemType).toBe('voucher.confirm');
    expect(result.confirm.item.subStatus).toBe('pending_completion');
    expect(result.replay).toBeNull(); // version-guarded one-shot

    const voucher = await withScope(ORG, LB, (tx) => getVoucherTx(tx, result.voucherId));
    expect(voucher?.status).toBe('draft');
    expect(voucher?.lines).toHaveLength(1);
  });
});
