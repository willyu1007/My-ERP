/**
 * Postgres RLS integration test for T-005 Contract: ledger-scoped CRUD, isolation,
 * the optimistic (version-guarded) update, and the contractId dimension — vouchers
 * and payments linked by contractId are found via the timeline repos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  countContractsTx,
  createContractTx,
  createPaymentDocTx,
  createVoucherTx,
  disconnectDatabase,
  getContractTx,
  listContractsTx,
  listPaymentDocsByContractTx,
  listVouchersByContractTx,
  updateContractTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_t005_contract_test';
const ORG = '00000000-0000-0000-0000-00000000000d';
const LB_A = '00000000-0000-0000-0000-0000000000d1';
const LB_B = '00000000-0000-0000-0000-0000000000d2';

const contractInput = (code: string) => ({
  ledgerBookId: LB_A,
  code,
  title: '年度供货合同',
  type: 'sales',
  counterparty: '某客户',
  amount: '50000.00',
  createdBy: 'u1',
});

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — contract (ledger-scoped) + contractId dimension', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "contract" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org D');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','D Book A','CNY',2026),
         ('${LB_B}','${ORG}','D Book B','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates, lists, and isolates contracts by ledger', async () => {
    const c = await withLedgerScope(LB_A, (tx) => createContractTx(tx, contractInput('HT-2026-001')));
    expect(c.status).toBe('draft');
    expect(c.amount).toBe('50000.00');
    expect(c.version).toBe(0);

    expect(await withLedgerScope(LB_A, (tx) => listContractsTx(tx))).toHaveLength(1);
    expect(await withLedgerScope(LB_B, (tx) => listContractsTx(tx))).toHaveLength(0); // RLS isolation
    expect((await withLedgerScope(LB_A, (tx) => getContractTx(tx, c.id)))?.code).toBe('HT-2026-001');
    expect(await withLedgerScope(LB_A, (tx) => countContractsTx(tx))).toBe(1);
  });

  it('optimistic update bumps version; a stale version conflicts (null)', async () => {
    const c = await withLedgerScope(LB_A, (tx) => createContractTx(tx, contractInput('HT-2026-002')));
    const activated = await withLedgerScope(LB_A, (tx) =>
      updateContractTx(tx, c.id, { expectedVersion: 0, status: 'active' }),
    );
    expect(activated?.status).toBe('active');
    expect(activated?.version).toBe(1);
    expect(
      await withLedgerScope(LB_A, (tx) => updateContractTx(tx, c.id, { expectedVersion: 0, status: 'closed' })),
    ).toBeNull();
  });

  it('finds vouchers + payments linked by contractId (the timeline dimension)', async () => {
    const c = await withLedgerScope(LB_A, (tx) => createContractTx(tx, contractInput('HT-2026-003')));

    await withLedgerScope(LB_A, (tx) =>
      createVoucherTx(tx, {
        ledgerBookId: LB_A,
        no: '记-2026-06-001',
        date: '2026-06-10',
        period: '2026-06',
        summary: '合同首款',
        maker: 'u1',
        totalDebit: '1000.00',
        totalCredit: '1000.00',
        contractId: c.id,
        lines: [
          { accountCode: '1002', accountName: '银行存款', summary: 'x', debit: '1000.00', credit: null },
          { accountCode: '6001', accountName: '收入', summary: 'x', debit: null, credit: '1000.00' },
        ],
      }),
    );
    // an unlinked voucher must be excluded
    await withLedgerScope(LB_A, (tx) =>
      createVoucherTx(tx, {
        ledgerBookId: LB_A,
        no: '记-2026-06-002',
        date: '2026-06-11',
        period: '2026-06',
        summary: '无关',
        maker: 'u1',
        totalDebit: '5.00',
        totalCredit: '5.00',
        lines: [
          { accountCode: '1002', accountName: '银行存款', summary: 'x', debit: '5.00', credit: null },
          { accountCode: '6001', accountName: '收入', summary: 'x', debit: null, credit: '5.00' },
        ],
      }),
    );
    await withLedgerScope(LB_A, (tx) =>
      createPaymentDocTx(tx, {
        ledgerBookId: LB_A,
        no: '收-2026-06-001',
        direction: 'receipt',
        date: '2026-06-12',
        period: '2026-06',
        counterparty: '某客户',
        summary: '合同收款',
        amount: '1000.00',
        cashAccountCode: '1002',
        contraAccountCode: '1122',
        maker: 'u1',
        contractId: c.id,
      }),
    );

    const vouchers = await withLedgerScope(LB_A, (tx) => listVouchersByContractTx(tx, c.id));
    expect(vouchers.map((v) => v.no)).toEqual(['记-2026-06-001']); // only the linked one
    expect(vouchers[0].contractId).toBe(c.id);
    const payments = await withLedgerScope(LB_A, (tx) => listPaymentDocsByContractTx(tx, c.id));
    expect(payments.map((p) => p.no)).toEqual(['收-2026-06-001']);
  });
});
