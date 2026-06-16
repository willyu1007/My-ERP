import { describe, expect, it } from 'vitest';
import { buildCloseLossesEntry, type CloseInputRow } from './period-close';

const revenue = (credit: string): CloseInputRow => ({
  accountCode: '6001',
  accountName: '主营业务收入',
  category: 'profitLoss',
  closingDebit: '0.00',
  closingCredit: credit,
});
const expense = (code: string, debit: string): CloseInputRow => ({
  accountCode: code,
  accountName: code === '6601' ? '销售费用' : '管理费用',
  category: 'profitLoss',
  closingDebit: debit,
  closingCredit: '0.00',
});
const asset: CloseInputRow = {
  accountCode: '1002',
  accountName: '银行存款',
  category: 'asset',
  closingDebit: '5000.00',
  closingCredit: '0.00',
};

function sum(lines: readonly { debit?: string; credit?: string }[], k: 'debit' | 'credit'): number {
  return lines.reduce((t, l) => t + Number(l[k] ?? 0), 0);
}

describe('结转损益 (buildCloseLossesEntry)', () => {
  it('carries a profit: zeroes P&L into 本年利润 (credit), balanced', () => {
    const { lines, netProfit } = buildCloseLossesEntry([revenue('1000.00'), expense('6601', '300.00'), asset]);
    expect(netProfit).toBe('700.00');
    expect(lines.find((l) => l.accountCode === '6001')).toMatchObject({ debit: '1000.00' });
    expect(lines.find((l) => l.accountCode === '6601')).toMatchObject({ credit: '300.00' });
    expect(lines.find((l) => l.accountCode === '4103')).toMatchObject({ credit: '700.00' });
    expect(lines.some((l) => l.accountCode === '1002')).toBe(false); // assets ignored
    expect(sum(lines, 'debit')).toBeCloseTo(sum(lines, 'credit')); // balanced
  });

  it('carries a loss: 本年利润 on the debit side', () => {
    const { lines, netProfit } = buildCloseLossesEntry([revenue('200.00'), expense('6602', '500.00')]);
    expect(netProfit).toBe('-300.00');
    expect(lines.find((l) => l.accountCode === '4103')).toMatchObject({ debit: '300.00' });
    expect(sum(lines, 'debit')).toBeCloseTo(sum(lines, 'credit'));
  });

  it('no P&L balances → no lines, flat', () => {
    const { lines, netProfit } = buildCloseLossesEntry([asset]);
    expect(lines).toHaveLength(0);
    expect(netProfit).toBe('0.00');
  });
});
