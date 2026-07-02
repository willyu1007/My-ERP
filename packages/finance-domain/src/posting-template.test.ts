import { describe, expect, it } from 'vitest';
import { buildDraftFromExtraction, selectPostingTemplate } from './posting-template';

describe('T-004 posting templates', () => {
  it('maps a bank inflow slip to a bank debit + open contra credit', () => {
    const built = buildDraftFromExtraction({
      docType: 'bank_slip',
      direction: 'in',
      amount: '1000.00',
      date: '2026-06-15',
      summary: '收货款',
    });
    expect(built).not.toBeNull();
    expect(built?.templateKey).toBe('bank-slip');
    expect(built?.draft.lines[0]).toMatchObject({ accountCode: '1002', debit: '1000.00' });
    expect(built?.draft.lines[1].accountCode).toBeUndefined();
    expect(built?.draft.lines[1].credit).toBe('1000.00');
    // contra needs a human-chosen account → not complete → routes to pending_completion
    expect(built?.complete).toBe(false);
  });

  it('maps an outflow slip to a bank credit + open contra debit', () => {
    const built = buildDraftFromExtraction({
      docType: 'bank_slip',
      direction: 'out',
      amount: '500.00',
    });
    expect(built?.draft.lines[0]).toMatchObject({ accountCode: '1002', credit: '500.00' });
    expect(built?.draft.lines[1].debit).toBe('500.00');
  });

  it('returns null for an unmatched or amount-less capture', () => {
    expect(buildDraftFromExtraction({ docType: 'unknown' })).toBeNull();
    expect(buildDraftFromExtraction({ docType: 'bank_slip' })).toBeNull();
    expect(selectPostingTemplate({ docType: 'invoice' })).toBeNull();
  });
});
