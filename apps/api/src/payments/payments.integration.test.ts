/**
 * Service-level integration test for T-007 (cashier MVP, C4). Drives the real
 * PaymentsService against a live Postgres through the whole lifecycle — locking in
 * the state machine, SoD (申请≠审批≠确认), and the auto-generated + posted settlement
 * voucher — so the orchestration is covered in CI, not only by a manual e2e.
 * Skips without a local test Postgres, like the other *.integration.test.ts.
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
import {
  disconnectDatabase,
  seedAccountsTx,
  withLedgerScope,
  type SeedAccountInput,
} from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { PaymentsService } from './payments.service';

const TEST_DB = 'myerp_t007_payments_test';
const ORG = '00000000-0000-0000-0000-00000000000e';
const LB_SP = '00000000-0000-0000-0000-0000000000e1'; // single-person mode
const LB_MP = '00000000-0000-0000-0000-0000000000e2'; // multi-person (SoD enforced)

const u1: Identity = { userId: 'u1', orgId: ORG, ledgerBookId: LB_SP, roles: [] };
const u2: Identity = { userId: 'u2', orgId: ORG, ledgerBookId: LB_MP, roles: [] };

const CHART: readonly SeedAccountInput[] = [
  {
    code: '1002',
    name: '银行存款',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '1122',
    name: '应收账款',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '2202',
    name: '应付账款',
    category: 'liability',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
];

const receipt = {
  direction: 'receipt',
  date: '2026-06-10',
  counterparty: '某客户',
  summary: '收回货款',
  amount: '1000.00',
  cashAccountCode: '1002',
  contraAccountCode: '1122',
};

const payments = new PaymentsService();

describe.skipIf(!PG_AVAILABLE)('T-007 cashier payments (service integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book", "period_close" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "account" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "work_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "work_item_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "outbox_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org E');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year,single_person_mode) VALUES
         ('${LB_SP}','${ORG}','SP Book','CNY',2026,true),
         ('${LB_MP}','${ORG}','MP Book','CNY',2026,false);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
    await withLedgerScope(LB_SP, (tx) => seedAccountsTx(tx, LB_SP, CHART));
    await withLedgerScope(LB_MP, (tx) => seedAccountsTx(tx, LB_MP, CHART));
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('single-person: create→submit→approve→confirm posts a balanced settlement voucher', async () => {
    const created = await payments.create(u1, LB_SP, receipt);
    expect(created.status).toBe('draft');
    expect(created.no).toBe('收-2026-06-001');

    const submitted = await payments.submit(u1, LB_SP, created.id, created.version);
    expect(submitted.status).toBe('pending_approval');

    const approved = await payments.approve(u1, LB_SP, submitted.id, submitted.version);
    expect(approved.status).toBe('approved');

    const confirmed = await payments.confirm(u1, LB_SP, approved.id, approved.version, true);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.settlementVoucher.status).toBe('posted');
    expect(confirmed.settlementVoucher.totalDebit).toBe('1000.00');
    expect(confirmed.settlementVoucher.totalCredit).toBe('1000.00');
    // receipt → 借 cash (1002), 贷 contra (1122)
    const byAcct = Object.fromEntries(
      confirmed.settlementVoucher.lines.map((l) => [l.accountCode, l]),
    );
    expect(byAcct['1002'].debit).toBe('1000.00');
    expect(byAcct['1122'].credit).toBe('1000.00');
  });

  it('single-person: maker self-confirm without confirmSinglePerson is rejected', async () => {
    const created = await payments.create(u1, LB_SP, receipt);
    const submitted = await payments.submit(u1, LB_SP, created.id, created.version);
    const approved = await payments.approve(u1, LB_SP, submitted.id, submitted.version);
    await expect(
      payments.confirm(u1, LB_SP, approved.id, approved.version, false),
    ).rejects.toThrow();
  });

  it('multi-person SoD: maker cannot approve/confirm own; another user can', async () => {
    const maker: Identity = { ...u1, ledgerBookId: LB_MP };
    const created = await payments.create(maker, LB_MP, receipt);
    const submitted = await payments.submit(maker, LB_MP, created.id, created.version);

    // maker (u1) approving their own doc → forbidden (SoD).
    await expect(payments.approve(maker, LB_MP, submitted.id, submitted.version)).rejects.toThrow();

    // a different user approves, then confirms (≠ maker, no single-person needed).
    const approved = await payments.approve(u2, LB_MP, submitted.id, submitted.version);
    expect(approved.status).toBe('approved');
    expect(approved.approver).toBe('u2');
    const confirmed = await payments.confirm(u2, LB_MP, approved.id, approved.version, false);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.settlementVoucher.status).toBe('posted');
  });

  it('rejects a non-cash account as the cash side, and a stale version', async () => {
    await expect(
      payments.create(u1, LB_SP, {
        ...receipt,
        cashAccountCode: '1122',
        contraAccountCode: '1002',
      }),
    ).rejects.toThrow(); // 1122 is not a 货币资金 account

    const created = await payments.create(u1, LB_SP, receipt);
    await payments.submit(u1, LB_SP, created.id, created.version);
    // re-using the pre-submit version is stale → conflict.
    await expect(payments.submit(u1, LB_SP, created.id, created.version)).rejects.toThrow();
  });
});
