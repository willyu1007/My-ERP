import { describe, it, expect } from 'vitest';
import { Money, isBalanced } from './index';

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
