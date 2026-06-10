import { describe, it, expect } from 'vitest';
import { Money, isBalanced, voucherBalanceError } from './index';

describe('Money', () => {
  it('adds without float error (0.1 + 0.2 === 0.30)', () => {
    const result = Money.of('0.1').add(Money.of('0.2'));
    expect(result.toString()).toBe('0.30');
  });

  it('subtracts to zero', () => {
    expect(Money.of('100.00').subtract(Money.of('100.00')).isZero()).toBe(true);
  });
});

describe('isBalanced (借贷必平)', () => {
  it('is balanced when debits equal credits', () => {
    expect(isBalanced([Money.of('30.00'), Money.of('70.00')], [Money.of('100.00')])).toBe(true);
  });

  it('is not balanced otherwise', () => {
    expect(isBalanced([Money.of('30.00')], [Money.of('100.00')])).toBe(false);
  });
});

describe('voucherBalanceError', () => {
  it('accepts a balanced two-line entry', () => {
    expect(voucherBalanceError([{ debit: '500000.00' }, { credit: '500000.00' }])).toBeNull();
  });
  it('accepts a balanced split (价税分离)', () => {
    expect(voucherBalanceError([{ debit: '33900.00' }, { credit: '30000.00' }, { credit: '3900.00' }])).toBeNull();
  });
  it('rejects unbalanced debits/credits', () => {
    expect(voucherBalanceError([{ debit: '100.00' }, { credit: '100.01' }])).toMatch(/借贷必平/);
  });
  it('rejects fewer than two lines', () => {
    expect(voucherBalanceError([{ debit: '1.00' }])).toMatch(/two entry lines/);
  });
  it('rejects a line with both debit and credit', () => {
    expect(voucherBalanceError([{ debit: '1.00', credit: '1.00' }, { credit: '1.00' }])).toMatch(/both/);
  });
  it('rejects a line with neither amount, and a zero total', () => {
    expect(voucherBalanceError([{ debit: '1.00' }, {}])).toMatch(/debit or a credit/);
    expect(voucherBalanceError([{ debit: '0.00' }, { credit: '0.00' }])).toMatch(/cannot be zero/);
  });
});
