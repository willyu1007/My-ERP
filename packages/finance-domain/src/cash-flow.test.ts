import { describe, expect, it } from 'vitest';
import { cashFlowTieOut, isCashAccountCode, listUntaggedCashFlows } from './cash-flow';
import type { PostedLine } from './ledger';

const line = (over: Partial<PostedLine>): PostedLine => ({
  accountCode: '',
  accountName: '',
  debit: null,
  credit: null,
  voucherId: 'v1',
  voucherNo: '记-1',
  date: '2026-06-10',
  summary: '',
  cashFlowItem: null,
  ...over,
});

describe('cash flow tagging', () => {
  it('identifies cash accounts by code prefix', () => {
    expect(isCashAccountCode('1002')).toBe(true);
    expect(isCashAccountCode('100201')).toBe(true);
    expect(isCashAccountCode('1012')).toBe(true);
    expect(isCashAccountCode('6001')).toBe(false);
  });

  it('ties out when the contra is tagged; flags a mismatch when not', () => {
    const tagged = [
      line({ voucherId: 'v1', accountCode: '1002', debit: '1000.00' }),
      line({ voucherId: 'v1', accountCode: '6001', credit: '1000.00', cashFlowItem: 'OP-IN-1' }),
    ];
    const t = cashFlowTieOut(tagged);
    expect(t.cashNetChange).toBe('1000.00');
    expect(t.taggedFlows).toBe('1000.00');
    expect(t.tied).toBe(true);

    const untagged = [
      line({ voucherId: 'v2', accountCode: '1002', debit: '500.00' }),
      line({ voucherId: 'v2', accountCode: '6001', credit: '500.00' }),
    ];
    const u = cashFlowTieOut(untagged);
    expect(u.cashNetChange).toBe('500.00');
    expect(u.taggedFlows).toBe('0.00');
    expect(u.tied).toBe(false);
  });

  it('lists untagged cash-voucher lines; ignores non-cash vouchers and tagged lines', () => {
    const entries = [
      line({ voucherId: 'v1', accountCode: '1002', debit: '500.00' }),
      line({ voucherId: 'v1', accountCode: '6001', credit: '500.00' }), // untagged → worklist
      line({ voucherId: 'v2', accountCode: '1122', debit: '300.00' }), // no cash line
      line({ voucherId: 'v2', accountCode: '6001', credit: '300.00' }),
      line({ voucherId: 'v3', accountCode: '1002', debit: '200.00' }),
      line({ voucherId: 'v3', accountCode: '6001', credit: '200.00', cashFlowItem: 'OP-IN-1' }), // tagged
    ];
    const w = listUntaggedCashFlows(entries);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ voucherId: 'v1', accountCode: '6001' });
  });
});
