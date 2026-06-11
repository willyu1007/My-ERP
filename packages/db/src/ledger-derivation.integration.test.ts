/**
 * Integration test for P4 ledger derivation — the trial balance + account ledger
 * are derived from POSTED voucher lines (getPostedEntriesTx + finance-domain),
 * with drafts excluded. Connects as a NON-privileged role; skips without PG.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import { computeAccountLedger, computeTrialBalance } from '@my-erp/finance-domain';
import {
  createReversalVoucherTx,
  createVoucherTx,
  disconnectDatabase,
  getPostedEntriesTx,
  getVoucherTx,
  setVoucherStatusTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_p4_ledger_test';
const ORG = '00000000-0000-0000-0000-0000000000ee';
const LB = '00000000-0000-0000-0000-00000000e001';

const voucher = (no: string) => ({
  ledgerBookId: LB,
  no,
  date: '2026-06-01',
  period: '2026-06',
  summary: '收到投资',
  maker: 'u1',
  totalDebit: '500.00',
  totalCredit: '500.00',
  lines: [
    {
      accountCode: '1002',
      accountName: '银行存款',
      summary: '投资',
      debit: '500.00',
      credit: null,
    },
    {
      accountCode: '4001',
      accountName: '实收资本',
      summary: '投资',
      debit: null,
      credit: '500.00',
    },
  ],
});

describe.skipIf(!PG_AVAILABLE)('P4 ledger derivation from posted vouchers', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES ('${LB}','${ORG}','Book','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
    // Post two vouchers (as the app role); leave a third as a draft (must be excluded).
    await withLedgerScope(LB, async (tx) => {
      for (const no of ['记-2026-001', '记-2026-002']) {
        const v = await createVoucherTx(tx, voucher(no));
        await setVoucherStatusTx(tx, v.id, {
          status: 'posted',
          checker: 'u2',
          postedAt: new Date(),
        });
      }
      await createVoucherTx(tx, voucher('记-2026-003')); // draft
    });
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('derives a balanced trial balance from posted lines only (draft excluded)', async () => {
    const entries = await withLedgerScope(LB, (tx) => getPostedEntriesTx(tx));
    expect(entries).toHaveLength(4); // 2 posted vouchers × 2 lines; the draft's 2 lines excluded

    const tb = computeTrialBalance(entries, []);
    expect(tb.balanced.period).toBe(true);
    expect(tb.balanced.closing).toBe(true);
    expect(tb.rows.find((r) => r.accountCode === '1002')?.closingDebit).toBe('1000.00'); // 500 + 500
    expect(tb.rows.find((r) => r.accountCode === '4001')?.closingCredit).toBe('1000.00');
  });

  it('derives a running account ledger', async () => {
    const entries = await withLedgerScope(LB, (tx) => getPostedEntriesTx(tx));
    const ledger = computeAccountLedger('1002', entries, []);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.closing.balance).toBe('1000.00');
    expect(ledger.closing.balanceDir).toBe('借');
  });

  it('a reversed voucher nets to zero in the ledger (both entries counted)', async () => {
    // Post a voucher touching fresh accounts (6602/1001), then reverse it.
    const v = await withLedgerScope(LB, async (tx) => {
      const created = await createVoucherTx(tx, {
        ledgerBookId: LB,
        no: '记-2026-004',
        date: '2026-06-05',
        period: '2026-06',
        summary: '计提',
        maker: 'u1',
        totalDebit: '100.00',
        totalCredit: '100.00',
        lines: [
          {
            accountCode: '6602',
            accountName: '管理费用',
            summary: 'x',
            debit: '100.00',
            credit: null,
          },
          {
            accountCode: '1001',
            accountName: '库存现金',
            summary: 'x',
            debit: null,
            credit: '100.00',
          },
        ],
      });
      await setVoucherStatusTx(tx, created.id, {
        status: 'posted',
        checker: 'u2',
        postedAt: new Date(),
      });
      return getVoucherTx(tx, created.id);
    });
    await withLedgerScope(LB, async (tx) => {
      const r = await createReversalVoucherTx(tx, v!, {
        no: '记-2026-005',
        reverser: 'u2',
        date: v!.date,
        period: v!.period,
        postedAt: new Date(),
      });
      await setVoucherStatusTx(tx, v!.id, { status: 'reversed', reversedBy: r.id });
    });

    const entries = await withLedgerScope(LB, (tx) => getPostedEntriesTx(tx));
    const tb = computeTrialBalance(entries, []);
    const row = tb.rows.find((r) => r.accountCode === '6602');
    expect(row?.periodDebit).toBe('100.00'); // original posting still counted
    expect(row?.periodCredit).toBe('100.00'); // reversal negates it
    expect(row?.closingDebit).toBe('0.00');
    expect(row?.closingCredit).toBe('0.00');
    expect(tb.balanced.closing).toBe(true);

    const ledger = computeAccountLedger('6602', entries, []);
    expect(ledger.rows).toHaveLength(2); // original + reversal both visible
    expect(ledger.closing.balance).toBe('0.00');
    expect(ledger.closing.balanceDir).toBe('平');
  });
});
