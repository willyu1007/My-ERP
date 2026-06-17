import { describe, expect, it } from 'vitest';
import type { IntakeEntity } from '@my-erp/db';
import { buildIntakeOutboxEnvelope } from './intake-outbox';

// An intake whose extraction holds financial detail (amount) — it must never leak.
const intake = {
  id: '00000000-0000-0000-0000-0000000000c1',
  orgId: '00000000-0000-0000-0000-00000000000a',
  ledgerBookId: '00000000-0000-0000-0000-0000000000a1',
  source: 'web',
  kind: 'image',
  status: 'received',
  attachmentId: '00000000-0000-0000-0000-0000000000d1',
  extraction: { fields: { amount: { value: '1234.56', confidence: 1 }, counterparty: { value: 'ACME', confidence: 1 } } },
  confidence: 0.9,
  needsReview: false,
  targetType: null,
  targetId: null,
  channelRef: null,
  createdBy: 'accountant-a',
  version: 0,
  createdAt: new Date('2026-06-15T00:00:00.000Z'),
  updatedAt: new Date('2026-06-15T00:00:00.000Z'),
} satisfies IntakeEntity;

describe('intake outbox envelope (metadata-only)', () => {
  it('builds a metadata-only envelope and leaks no financial detail', () => {
    const env = buildIntakeOutboxEnvelope(intake, 'intake.received', '2026-06-15T00:00:00.000Z');
    expect(env.sourceType).toBe('Intake');
    expect(env.sourceId).toBe(intake.id);
    expect(env.titleKey).toBe('finance.intake.received');
    // intakes have no per-id detail route; the deep link points at 凭证处理 (where drafts are confirmed).
    expect(env.deepLink).toBe('/finance/daily-accounting');
    // the extracted amount/counterparty must not appear anywhere in the payload
    const serialized = JSON.stringify(env);
    expect(serialized).not.toContain('1234.56');
    expect(serialized).not.toContain('ACME');
    expect(serialized).not.toContain('extraction');
  });
});
