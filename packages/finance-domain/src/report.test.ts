import { describe, expect, it } from 'vitest';
import { balanceSheet, cashFlowStatement, incomeStatement, type CashFlowItemRef } from './report';
import type { PostedLine } from './ledger';

const CATEGORY: Record<string, string> = {
  '1001': 'asset',
  '1002': 'asset',
  '2202': 'liability',
  '4001': 'equity',
  '4103': 'equity',
  '4104': 'equity',
  '6001': 'profitLoss',
  '6601': 'profitLoss',
};
const categoryOf = (code: string): string => CATEGORY[code] ?? 'asset';

const n = 0;
const v = (over: Partial<PostedLine>): PostedLine => ({
  accountCode: '',
  accountName: '',
  debit: null,
  credit: null,
  voucherId: `v${n}`,
  voucherNo: `记-${n}`,
  date: '2026-03-10',
  summary: '',
  cashFlowItem: null,
  ...over,
});

// 实收资本注入 (1002/4001 50000, 4001→FN-IN-1) · 销售 (1002/6001 1000, →OP-IN-1) · 费用 (6601/1002 300, →OP-OUT-4)
const entries: PostedLine[] = [
  v({ voucherId: 'c', accountCode: '1002', debit: '50000.00' }),
  v({ voucherId: 'c', accountCode: '4001', credit: '50000.00', cashFlowItem: 'FN-IN-1' }),
  v({ voucherId: 's', accountCode: '1002', debit: '1000.00' }),
  v({ voucherId: 's', accountCode: '6001', credit: '1000.00', cashFlowItem: 'OP-IN-1' }),
  v({ voucherId: 'e', accountCode: '6601', debit: '300.00', cashFlowItem: 'OP-OUT-4' }),
  v({ voucherId: 'e', accountCode: '1002', credit: '300.00' }),
];

const items: CashFlowItemRef[] = [
  { code: 'OP-IN-1', name: '销售商品收到的现金', activity: 'operating', direction: 'inflow' },
  { code: 'OP-OUT-4', name: '支付其他经营现金', activity: 'operating', direction: 'outflow' },
  { code: 'FN-IN-1', name: '吸收投资收到的现金', activity: 'financing', direction: 'inflow' },
];

const amt = (lines: readonly { key: string; amount: string }[], key: string): string =>
  lines.find((l) => l.key === key)?.amount ?? '';

describe('statutory reports (worked fixture)', () => {
  it('balance sheet balances; equity holds the un-结转 profit', () => {
    const bs = balanceSheet(entries, [], categoryOf, '2026-12-31');
    expect(amt(bs.lines, 'cash')).toBe('50700.00'); // 50000 + 1000 − 300
    expect(amt(bs.lines, 'total_assets')).toBe('50700.00');
    expect(amt(bs.lines, 'paid_in_capital')).toBe('50000.00');
    expect(amt(bs.lines, 'retained_earnings')).toBe('700.00'); // 净利润, not yet 结转
    expect(amt(bs.lines, 'total_liabilities_equity')).toBe('50700.00');
    expect(bs.balanced).toBe(true);
  });

  it('income statement nets to 净利润', () => {
    const is = incomeStatement(entries, categoryOf, '2026-01-01', '2026-12-31');
    expect(amt(is.lines, 'revenue')).toBe('1000.00');
    expect(amt(is.lines, 'selling')).toBe('300.00');
    expect(is.netProfit).toBe('700.00');
  });

  it('income statement excludes the 结转损益 closing voucher (regression)', () => {
    // The closing voucher zeroes 6001/6601 into 4103; if not excluded it nets revenue to 0.
    const closing: PostedLine[] = [
      v({ voucherId: 'close', accountCode: '6001', debit: '1000.00', date: '2026-12-31' }),
      v({ voucherId: 'close', accountCode: '6601', credit: '300.00', date: '2026-12-31' }),
      v({ voucherId: 'close', accountCode: '4103', credit: '700.00', date: '2026-12-31' }),
    ];
    const all = [...entries, ...closing];
    const polluted = incomeStatement(all, categoryOf, '2026-01-01', '2026-12-31');
    expect(amt(polluted.lines, 'revenue')).toBe('0.00'); // the bug, without exclusion
    const correct = incomeStatement(all, categoryOf, '2026-01-01', '2026-12-31', new Set(['close']));
    expect(amt(correct.lines, 'revenue')).toBe('1000.00');
    expect(correct.netProfit).toBe('700.00');
  });

  it('cash flow statement ties out to the net cash change', () => {
    const cf = cashFlowStatement(entries, items, '2026-01-01', '2026-12-31');
    const op = cf.activities.find((a) => a.activity === 'operating');
    const fn = cf.activities.find((a) => a.activity === 'financing');
    expect(op?.subtotal).toBe('700.00'); // 1000 − 300
    expect(fn?.subtotal).toBe('50000.00');
    expect(cf.netCashFlow).toBe('50700.00');
    expect(cf.tied).toBe(true);
  });
});
