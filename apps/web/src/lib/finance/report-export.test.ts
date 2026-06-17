import { describe, expect, it } from 'vitest';
import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';
import { reportsToCsv, toCsv } from './report-export';

describe('report CSV export', () => {
  it('quotes cells with commas/quotes and joins with CRLF', () => {
    expect(toCsv([['a', 'b,c'], ['d"e', 'f']])).toBe('a,"b,c"\r\n"d""e",f');
  });

  it('leaves plain cells unquoted', () => {
    expect(toCsv([['plain', '1234.00']])).toBe('plain,1234.00');
  });

  it('builds a three-section combined CSV', () => {
    const bs: BalanceSheet = {
      asOf: '2026-03-31',
      balanced: true,
      lines: [
        { key: 'cash', label: '货币资金', level: 1, amount: '50700.00' },
        { key: 'total_assets', label: '资产总计', level: 0, amount: '50700.00' },
      ],
    };
    const is: IncomeStatement = {
      from: '2026-03-01',
      to: '2026-03-31',
      netProfit: '700.00',
      lines: [{ key: 'revenue', label: '营业收入', level: 1, amount: '1000.00' }],
    };
    const cf: CashFlowStatement = {
      from: '2026-03-01',
      to: '2026-03-31',
      netCashFlow: '50700.00',
      tied: true,
      activities: [
        {
          activity: 'operating',
          subtotal: '700.00',
          lines: [{ code: 'OP-IN-1', name: '销售商品收到的现金', amount: '1000.00' }],
        },
      ],
    };

    const csv = reportsToCsv('2026 年 3 月', bs, is, cf);
    expect(csv).toContain('财务报表,2026 年 3 月');
    expect(csv).toContain('资产负债表（截至 2026-03-31）');
    expect(csv).toContain('营业收入,1000.00');
    expect(csv).toContain('一、经营活动产生的现金流量,700.00');
    expect(csv).toContain('现金及现金等价物净增加额,50700.00');
  });
});
