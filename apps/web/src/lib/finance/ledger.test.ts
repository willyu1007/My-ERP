import { describe, expect, it } from 'vitest';
import { ACCOUNTS, OPENING_BALANCES, VOUCHERS } from './fixtures';
import { computeAccountLedger, computeTrialBalance } from './ledger';

describe('ledger — derived from posted vouchers + opening balances', () => {
  const tb = computeTrialBalance(ACCOUNTS, VOUCHERS, OPENING_BALANCES);

  it('trial balance is balanced on all three column pairs (借=贷)', () => {
    expect(tb.balanced.opening).toBe(true);
    expect(tb.balanced.period).toBe(true);
    expect(tb.balanced.closing).toBe(true);
  });

  it('totals match the demo data', () => {
    expect(tb.totals.openingDebit).toBe('285000.00');
    expect(tb.totals.openingCredit).toBe('285000.00');
    // posted: v-001 (借工行/贷实收 500000) + v-002 (借管理费用/贷工行 1200)
    expect(tb.totals.periodDebit).toBe('501200.00');
    expect(tb.totals.periodCredit).toBe('501200.00');
    expect(tb.totals.closingDebit).toBe('785000.00');
    expect(tb.totals.closingCredit).toBe('785000.00');
  });

  it('excludes non-posted vouchers (pending/draft/reversed) from activity', () => {
    // 1122 应收账款 only appears on a pending voucher (v-003) → no period activity.
    expect(tb.rows.find((r) => r.code === '1122')).toBeUndefined();
  });

  it('running balance: 工商银行 = 期初200000 +500000 -1200 = 698800 借', () => {
    const ledger = computeAccountLedger('100201', ACCOUNTS, VOUCHERS, OPENING_BALANCES);
    expect(ledger).not.toBeNull();
    expect(ledger?.opening.balance).toBe('200000.00');
    expect(ledger?.rows.at(-1)?.balance).toBe('698800.00');
    expect(ledger?.closing.balance).toBe('698800.00');
    expect(ledger?.closing.balanceDir).toBe('借');
  });

  it('returns null for an unknown account', () => {
    expect(computeAccountLedger('9999', ACCOUNTS, VOUCHERS, OPENING_BALANCES)).toBeNull();
  });
});
