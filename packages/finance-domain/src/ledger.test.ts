import { describe, expect, it } from 'vitest';
import { computeAccountLedger, computeTrialBalance, type PostedLine } from './ledger';

// Posted: 收到投资 (借 1002 500000 / 贷 4001 500000), 采购 (借 6602 1200 / 贷 1002 1200).
const entries: PostedLine[] = [
  { accountCode: '1002', accountName: '银行存款', debit: '500000.00', credit: null, voucherId: 'v1', voucherNo: '记-001', date: '2026-06-01', summary: '收到投资' },
  { accountCode: '4001', accountName: '实收资本', debit: null, credit: '500000.00', voucherId: 'v1', voucherNo: '记-001', date: '2026-06-01', summary: '收到投资' },
  { accountCode: '6602', accountName: '管理费用', debit: '1200.00', credit: null, voucherId: 'v2', voucherNo: '记-002', date: '2026-06-03', summary: '采购' },
  { accountCode: '1002', accountName: '银行存款', debit: null, credit: '1200.00', voucherId: 'v2', voucherNo: '记-002', date: '2026-06-03', summary: '采购' },
];

describe('computeTrialBalance', () => {
  const tb = computeTrialBalance(entries, []);

  it('is balanced on period and closing (借=贷)', () => {
    expect(tb.balanced.period).toBe(true);
    expect(tb.balanced.closing).toBe(true);
    expect(tb.totals.periodDebit).toBe('501200.00');
    expect(tb.totals.periodCredit).toBe('501200.00');
  });

  it('computes per-account closing on the correct side', () => {
    const bank = tb.rows.find((r) => r.accountCode === '1002');
    expect(bank?.closingDebit).toBe('498800.00'); // 500000 - 1200
    expect(bank?.closingCredit).toBe('0.00');
    const capital = tb.rows.find((r) => r.accountCode === '4001');
    expect(capital?.closingCredit).toBe('500000.00');
  });
});

describe('computeAccountLedger', () => {
  it('runs a per-account balance with direction', () => {
    const ledger = computeAccountLedger('1002', entries, []);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows.at(-1)?.balance).toBe('498800.00');
    expect(ledger.rows.at(-1)?.balanceDir).toBe('借');
    expect(ledger.closing.balance).toBe('498800.00');
    expect(ledger.closing.debit).toBe('498800.00');
  });

  it('honors an opening balance', () => {
    const ledger = computeAccountLedger(
      '1002',
      entries,
      [{ accountCode: '1002', accountName: '银行存款', debit: '10000.00', credit: null }],
    );
    expect(ledger.opening.balance).toBe('10000.00');
    expect(ledger.closing.balance).toBe('508800.00'); // 10000 + 498800
  });
});
