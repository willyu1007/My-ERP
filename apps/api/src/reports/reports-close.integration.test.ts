/**
 * Service-level integration test for T-006 — the close → report orchestration.
 *
 * Drives the real Nest services (PeriodCloseService, ReportsService, CashFlowService)
 * against a live Postgres, end-to-end through the actual repos + finance-domain. It
 * locks in the IS-excludes-结转损益 regression: the closing voucher must not net out
 * 发生额 in the flow statements (IS/CF) — across closed / reopened / re-closed states —
 * while the balance sheet (stock) keeps it so 未分配利润 stays stable. Automates what
 * had been a manual `/v1` e2e. Connects as the non-privileged app role; skips without PG.
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
  createVoucherTx,
  disconnectDatabase,
  seedAccountsTx,
  seedCashFlowItemsTx,
  setVoucherStatusTx,
  withLedgerScope,
  type VoucherLineInput,
} from '@my-erp/db';
import { STANDARD_CASH_FLOW_ITEMS, STANDARD_CHART, type Identity } from '@my-erp/platform';
import { PeriodCloseService } from '../period-close/period-close.service';
import { CashFlowService } from '../cash-flow/cash-flow.service';
import { ReportsService } from './reports.service';

const TEST_DB = 'myerp_t006_reports_test';
const ORG = '00000000-0000-0000-0000-0000000000d6';
const LB = '00000000-0000-0000-0000-0000000006d1';
const IDENTITY: Identity = { userId: 'u1', orgId: ORG, ledgerBookId: LB, roles: [] };
const PERIOD = '2026-03';

const line = (over: Partial<VoucherLineInput>): VoucherLineInput => ({
  accountCode: '',
  accountName: '',
  summary: '',
  debit: null,
  credit: null,
  cashFlowItem: null,
  ...over,
});
const amt = (lines: readonly { key: string; amount: string }[], key: string): string =>
  lines.find((l) => l.key === key)?.amount ?? '';

const close = new PeriodCloseService();
const reports = new ReportsService();
const cashFlow = new CashFlowService();

describe.skipIf(!PG_AVAILABLE)('T-006 close → reports (service integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "account" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "period_close" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "cash_flow_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};
       GRANT SELECT ON "opening_balance", "organization", "ledger_book" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year)
         VALUES ('${LB}','${ORG}','Book','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();

    await withLedgerScope(LB, async (tx) => {
      await seedAccountsTx(tx, LB, STANDARD_CHART);
      await seedCashFlowItemsTx(tx, LB, STANDARD_CASH_FLOW_ITEMS);
      const post = async (
        no: string,
        date: string,
        lines: VoucherLineInput[],
        total: string,
        summary: string,
      ): Promise<void> => {
        const v = await createVoucherTx(tx, {
          ledgerBookId: LB,
          no,
          date,
          period: PERIOD,
          summary,
          maker: 'u1',
          totalDebit: total,
          totalCredit: total,
          lines,
        });
        await setVoucherStatusTx(tx, v.id, { status: 'posted', checker: 'u2', postedAt: new Date() });
      };
      // 实收资本 50000 (FN-IN-1) · 销售 1000 (OP-IN-1) · 费用 300 (OP-OUT-4) → 净利润 700
      await post(
        '记-2026-03-001',
        '2026-03-01',
        [
          line({ accountCode: '1002', accountName: '银行存款', debit: '50000.00' }),
          line({ accountCode: '4001', accountName: '实收资本', credit: '50000.00', cashFlowItem: 'FN-IN-1' }),
        ],
        '50000.00',
        '实收资本注入',
      );
      await post(
        '记-2026-03-002',
        '2026-03-10',
        [
          line({ accountCode: '1002', accountName: '银行存款', debit: '1000.00' }),
          line({ accountCode: '6001', accountName: '主营业务收入', credit: '1000.00', cashFlowItem: 'OP-IN-1' }),
        ],
        '1000.00',
        '销售收入',
      );
      await post(
        '记-2026-03-003',
        '2026-03-15',
        [
          line({ accountCode: '6601', accountName: '销售费用', debit: '300.00', cashFlowItem: 'OP-OUT-4' }),
          line({ accountCode: '1002', accountName: '银行存款', credit: '300.00' }),
        ],
        '300.00',
        '销售费用',
      );
    });
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('before close: IS nets to 净利润, BS balances, CF ties out', async () => {
    const is = await reports.incomeStatement(IDENTITY, LB, '2026-03-01', '2026-03-31');
    expect(amt(is.lines, 'revenue')).toBe('1000.00');
    expect(is.netProfit).toBe('700.00');

    const bs = await reports.balanceSheet(IDENTITY, LB, '2026-03-31');
    expect(bs.balanced).toBe(true);
    expect(amt(bs.lines, 'retained_earnings')).toBe('700.00'); // 未结转, computed from P&L

    const cf = await reports.cashFlow(IDENTITY, LB, '2026-03-01', '2026-03-31');
    expect(cf.tied).toBe(true);
    expect(cf.netCashFlow).toBe('50700.00');
  });

  it('untagged worklist is empty (every cash voucher is tagged)', async () => {
    expect(await cashFlow.untagged(IDENTITY, LB, PERIOD)).toHaveLength(0);
  });

  it('close: 结转损益 → 净利润 700, a close voucher is created', async () => {
    const r = await close.close(IDENTITY, LB, PERIOD);
    expect(r.status).toBe('closed');
    expect(r.netProfit).toBe('700.00');
    expect(r.closeVoucherId).not.toBeNull();
  });

  it('after close: IS/CF STILL exclude the 结转 voucher (regression — was 0), BS keeps it', async () => {
    const is = await reports.incomeStatement(IDENTITY, LB, '2026-03-01', '2026-03-31');
    expect(amt(is.lines, 'revenue')).toBe('1000.00'); // not 0 — the closing voucher is excluded
    expect(is.netProfit).toBe('700.00');

    const cf = await reports.cashFlow(IDENTITY, LB, '2026-03-01', '2026-03-31');
    expect(cf.tied).toBe(true);

    // BS (stock) KEEPS the closing voucher; 未分配利润 stays 700 (now persisted in 本年利润).
    const bs = await reports.balanceSheet(IDENTITY, LB, '2026-03-31');
    expect(bs.balanced).toBe(true);
    expect(amt(bs.lines, 'retained_earnings')).toBe('700.00');
  });

  it('reopen window then re-close: IS stays 1000 (the 结转 reversal is excluded too)', async () => {
    await close.reopen(IDENTITY, LB, PERIOD);
    const reopened = await reports.incomeStatement(IDENTITY, LB, '2026-03-01', '2026-03-31');
    expect(amt(reopened.lines, 'revenue')).toBe('1000.00'); // not 2000 — reversal excluded too
    expect(reopened.netProfit).toBe('700.00');

    const r = await close.close(IDENTITY, LB, PERIOD);
    expect(r.status).toBe('closed');
    const reclosed = await reports.incomeStatement(IDENTITY, LB, '2026-03-01', '2026-03-31');
    expect(amt(reclosed.lines, 'revenue')).toBe('1000.00');
    expect(reclosed.netProfit).toBe('700.00');
  });
});
