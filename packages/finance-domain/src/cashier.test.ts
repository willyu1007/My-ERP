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

  it('threads aux + cash-flow item onto the contra line only (T-012 Phase 3, D7)', () => {
    const aux = { customer: { id: 'p1', name: '某客户' } };
    const e = buildSettlementEntry({
      direction: 'receipt',
      amount: '1000',
      cash,
      contra: ar,
      contraAux: aux,
      contraCashFlowItem: '0101',
    });
    // cash (money) line: no aux / no cash-flow
    expect(e.lines[0]).toEqual({ accountCode: '1002', accountName: '银行存款', debit: '1000.00' });
    // contra (non-cash) line: carries aux + cash-flow item
    expect(e.lines[1]).toEqual({
      accountCode: '1122',
      accountName: '应收账款',
      credit: '1000.00',
      aux,
      cashFlowItem: '0101',
    });
  });

  it('omits aux / cash-flow keys when not enriched (legacy/direct docs)', () => {
    const e = buildSettlementEntry({ direction: 'payment', amount: '50', cash, contra: ap });
    expect(e.lines[0]).not.toHaveProperty('aux');
    expect(e.lines[0]).not.toHaveProperty('cashFlowItem');
    expect(e.lines[1]).not.toHaveProperty('cashFlowItem');
  });
});
