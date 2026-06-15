/**
 * T-004 capture intake contracts — proves the two-schema boundary:
 * `ExtractionResultSchema` is ERP-internal (financial detail allowed), while the
 * My-Chat `OutboxEventEnvelopeSchema` rejects any extraction detail.
 */
import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema, OutboxEventEnvelopeSchema } from './index';

describe('T-004 capture intake contracts', () => {
  it('ExtractionResultSchema accepts financial detail (it is ERP-internal)', () => {
    const parsed = ExtractionResultSchema.parse({
      docType: 'bank_slip',
      fields: {
        amount: { value: '1234.56', confidence: 0.98 },
        counterparty: { value: '某某有限公司', confidence: 0.9 },
        direction: { value: 'in', confidence: 0.95 },
        date: { value: '2026-06-15', confidence: 0.99 },
      },
      confidence: 0.95,
      needsReview: false,
      raw: 'BANK SLIP ... 1234.56 ...',
      extractor: { name: 'mock', version: 'v1' },
    });
    expect(parsed.fields.amount?.value).toBe('1234.56');
    expect(parsed.docType).toBe('bank_slip');
  });

  it('rejects a malformed amount', () => {
    expect(() =>
      ExtractionResultSchema.parse({
        docType: 'bank_slip',
        fields: { amount: { value: '12.345', confidence: 1 } },
        confidence: 1,
        needsReview: false,
        extractor: { name: 'm', version: 'v1' },
      }),
    ).toThrow();
  });

  it('the My-Chat outbox envelope rejects extraction detail (two-schema boundary)', () => {
    const base = {
      eventType: 'intake.drafted',
      orgId: '00000000-0000-0000-0000-000000000001',
      moduleKey: 'finance',
      workflowKey: 'daily-accounting',
      workflowVersion: 'v1',
      workItemType: 'voucher.confirm',
      sourceType: 'JournalVoucher',
      titleKey: 'finance.voucher.confirm',
      assignedRole: 'accountant',
      priority: 'normal' as const,
    };
    expect(OutboxEventEnvelopeSchema.parse(base)).toBeTruthy();
    expect(() => OutboxEventEnvelopeSchema.parse({ ...base, amount: '1234.56' })).toThrow();
    expect(() => OutboxEventEnvelopeSchema.parse({ ...base, counterparty: 'X' })).toThrow();
  });
});
