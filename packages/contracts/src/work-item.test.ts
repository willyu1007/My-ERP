import { describe, expect, it } from 'vitest';
import {
  OutboxEventEnvelopeSchema,
  SafeWorkItemMetadataSchema,
  WorkItemStatusSchema,
} from './index';

describe('work item contracts', () => {
  it('accepts the aligned v1 status vocabulary', () => {
    expect(WorkItemStatusSchema.options).toEqual([
      'open',
      'claimed',
      'waiting',
      'returned',
      'completed',
      'canceled',
    ]);
  });

  it('rejects financial detail in display-safe metadata', () => {
    expect(() => SafeWorkItemMetadataSchema.parse({ amount: '100.00' })).toThrow(
      /Unrecognized key/,
    );
    expect(() => SafeWorkItemMetadataSchema.parse({ nested: { accountLines: [] } })).toThrow(
      /Unrecognized key/,
    );
    expect(() => SafeWorkItemMetadataSchema.parse({ vendorName: 'ACME' })).toThrow(
      /Unrecognized key/,
    );
  });

  it('accepts only allowlisted display-safe metadata', () => {
    expect(SafeWorkItemMetadataSchema.parse({ sourceEntity: 'JournalVoucher' })).toEqual({
      sourceEntity: 'JournalVoucher',
    });
  });

  it('accepts metadata-only outbox envelopes', () => {
    expect(
      OutboxEventEnvelopeSchema.parse({
        eventType: 'work_item.created',
        orgId: '00000000-0000-0000-0000-00000000000a',
        ledgerBookId: '00000000-0000-0000-0000-0000000000a1',
        workItemId: '00000000-0000-0000-0000-000000000101',
        moduleKey: 'finance',
        workflowKey: 'daily-accounting',
        workflowVersion: 'v1',
        workItemType: 'voucher.review',
        sourceType: 'JournalVoucher',
        sourceId: '00000000-0000-0000-0000-000000000201',
        titleKey: 'finance.voucher.review',
        assignedRole: 'supervisor',
        priority: 'normal',
        status: 'open',
        subStatus: 'pending_review',
        deepLink: '/finance/daily-accounting/vouchers/00000000-0000-0000-0000-000000000201',
        occurredAt: '2026-06-13T00:00:00.000Z',
      }),
    ).toMatchObject({ eventType: 'work_item.created' });
  });

  it('rejects financial detail in outbox payloads', () => {
    expect(() =>
      OutboxEventEnvelopeSchema.parse({
        eventType: 'work_item.created',
        orgId: '00000000-0000-0000-0000-00000000000a',
        moduleKey: 'finance',
        workflowKey: 'daily-accounting',
        workflowVersion: 'v1',
        workItemType: 'voucher.review',
        sourceType: 'JournalVoucher',
        titleKey: 'finance.voucher.review',
        assignedRole: 'supervisor',
        priority: 'normal',
        summary: 'forbidden',
      }),
    ).toThrow();
  });
});
