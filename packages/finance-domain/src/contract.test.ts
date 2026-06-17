import { describe, expect, it } from 'vitest';
import { buildContractTimeline } from './contract';

describe('buildContractTimeline', () => {
  const input = {
    contract: { code: 'HT-2026-001', createdAt: '2026-06-01T08:00:00.000Z', title: '年度供货合同' },
    vouchers: [
      { id: 'v1', no: '记-2026-06-002', date: '2026-06-15', summary: '尾款', status: 'posted', amount: '500.00' },
      { id: 'v2', no: '记-2026-06-001', date: '2026-06-10', summary: '首款', status: 'posted', amount: '1000.00' },
    ],
    payments: [
      { id: 'p1', no: '收-2026-06-001', date: '2026-06-12', summary: '合同收款', status: 'confirmed', amount: '1000.00', direction: 'receipt' },
    ],
  };

  it('merges contract + vouchers + payments in ascending date order', () => {
    const t = buildContractTimeline(input);
    expect(t.map((i) => [i.kind, i.date])).toEqual([
      ['contract', '2026-06-01'],
      ['voucher', '2026-06-10'],
      ['payment', '2026-06-12'],
      ['voucher', '2026-06-15'],
    ]);
  });

  it('labels + links each item to its source', () => {
    const t = buildContractTimeline(input);
    const payment = t.find((i) => i.kind === 'payment')!;
    expect(payment.title).toBe('收款 收-2026-06-001');
    expect(payment.refType).toBe('PaymentDoc');
    expect(payment.refId).toBe('p1');
    expect(payment.amount).toBe('1000.00');
    const contractEvent = t[0];
    expect(contractEvent.title).toBe('合同建立 HT-2026-001');
    expect(contractEvent.amount).toBeNull();
  });

  it('handles a contract with no documents (just the created event)', () => {
    const t = buildContractTimeline({ contract: input.contract, vouchers: [], payments: [] });
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('contract');
  });
});
