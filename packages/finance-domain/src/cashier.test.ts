import { describe, expect, it } from 'vitest';
import { buildSettlementEntry } from './cashier';

const cash = { code: '1002', name: '银行存款' };
const ar = { code: '1122', name: '应收账款' };
const ap = { code: '2202', name: '应付账款' };

describe('buildSettlementEntry', () => {
  it('receipt (收款): 借 cash, 贷 contra', () => {
    const e = buildSettlementEntry({ direction: 'receipt', amount: '1000', cash, contra: ar });
    expect(e.lines).toEqual([
      { accountCode: '1002', accountName: '银行存款', debit: '1000.00' },
      { accountCode: '1122', accountName: '应收账款', credit: '1000.00' },
    ]);
    expect(e.totalDebit).toBe('1000.00');
    expect(e.totalCredit).toBe('1000.00');
  });

  it('payment (付款): 借 contra, 贷 cash', () => {
    const e = buildSettlementEntry({ direction: 'payment', amount: '300.5', cash, contra: ap });
    expect(e.lines).toEqual([
      { accountCode: '2202', accountName: '应付账款', debit: '300.50' },
      { accountCode: '1002', accountName: '银行存款', credit: '300.50' },
    ]);
    expect(e.totalDebit).toBe('300.50');
  });

  it('always balances (借贷必平)', () => {
    const e = buildSettlementEntry({ direction: 'payment', amount: '8888.88', cash, contra: ap });
    expect(e.totalDebit).toBe(e.totalCredit);
  });

  it('rejects non-positive amounts and same-account settlements', () => {
    expect(() =>
      buildSettlementEntry({ direction: 'receipt', amount: '0', cash, contra: ar }),
    ).toThrow();
    expect(() =>
      buildSettlementEntry({ direction: 'receipt', amount: '-5', cash, contra: ar }),
    ).toThrow();
    expect(() =>
      buildSettlementEntry({ direction: 'receipt', amount: '10', cash, contra: cash }),
    ).toThrow();
  });
});
