import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '@my-erp/contracts';
import { confirmSubStatus, flattenExtraction, shouldAutoDraft } from './draft';

const bankSlip: ExtractionResult = {
  docType: 'bank_slip',
  fields: {
    amount: { value: '1234.56', confidence: 0.97 },
    direction: { value: 'in', confidence: 0.95 },
    date: { value: '2026-06-15', confidence: 0.98 },
    summary: { value: '银行收款', confidence: 0.9 },
  },
  confidence: 0.95,
  needsReview: false,
  extractor: { name: 'mock', version: 'v1' },
};

const unknown: ExtractionResult = {
  docType: 'unknown',
  fields: {},
  confidence: 0.2,
  needsReview: true,
  extractor: { name: 'mock', version: 'v1' },
};

describe('intake draft helpers', () => {
  it('flattens extraction fields to plain values', () => {
    expect(flattenExtraction(bankSlip)).toMatchObject({
      docType: 'bank_slip',
      direction: 'in',
      amount: '1234.56',
      date: '2026-06-15',
      summary: '银行收款',
    });
  });

  it('auto-drafts a high-confidence matched capture, not an unknown one', () => {
    expect(shouldAutoDraft(bankSlip)).toBe(true);
    expect(shouldAutoDraft(unknown)).toBe(false);
    expect(shouldAutoDraft({ ...bankSlip, confidence: 0.5 })).toBe(false);
  });

  it('routes confidence: complete+high → confirmation, else completion', () => {
    expect(confirmSubStatus(true, 0.95)).toBe('pending_confirmation');
    // bank-slip leaves the contra open → not complete → completion regardless of confidence
    expect(confirmSubStatus(false, 0.95)).toBe('pending_completion');
    expect(confirmSubStatus(true, 0.5)).toBe('pending_completion');
    expect(confirmSubStatus(true, null)).toBe('pending_completion');
  });
});
