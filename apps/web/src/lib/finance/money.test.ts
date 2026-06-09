import { describe, expect, it } from 'vitest';
import { centsToString, isBalanced, sumCents, toCents } from './money';

describe('money — exact integer-cents, no float', () => {
  it('parses 2dp amounts to cents', () => {
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('100')).toBe(10000);
    expect(toCents('0.05')).toBe(5);
    expect(toCents('0.5')).toBe(50);
  });

  it('rejects malformed amounts', () => {
    expect(toCents('1.234')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents('-5')).toBeNull();
    expect(toCents('')).toBeNull();
  });

  it('round-trips cents to string', () => {
    expect(centsToString(123456)).toBe('1234.56');
    expect(centsToString(5)).toBe('0.05');
  });

  it('sums a column avoiding float drift (0.1 + 0.2)', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE floats; integer cents is exact.
    expect(sumCents(['0.10', '0.20'])).toBe(30);
    expect(centsToString(sumCents(['0.10', '0.20']))).toBe('0.30');
  });

  it('balances debit vs credit by cents', () => {
    expect(isBalanced(sumCents(['30000.00', '3900.00']), sumCents(['33900.00']))).toBe(true);
    expect(isBalanced(sumCents(['100.00']), sumCents(['100.01']))).toBe(false);
  });
});
