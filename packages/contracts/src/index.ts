import { z } from 'zod';

/**
 * Shared API/event contracts (zod). Generated OpenAPI types and event schemas
 * grow here across M1; P0a ships the health contract used by api + web.
 */
export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  time: z.string(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const WorkItemStatusSchema = z.enum([
  'open',
  'claimed',
  'waiting',
  'returned',
  'completed',
  'canceled',
]);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

export const PlatformSubStatusSchema = z.enum([
  'pending_completion',
  'pending_confirmation',
  'pending_review',
  'pending_correction',
  'pending_external',
  'pending_system',
  'pending_accounting',
  'blocked',
  'ready',
  'done',
]);
export type PlatformSubStatus = z.infer<typeof PlatformSubStatusSchema>;

export const WorkItemPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type WorkItemPriority = z.infer<typeof WorkItemPrioritySchema>;

export const WorkItemViewSchema = z.enum([
  'my_tasks',
  'role_queue',
  'created_by_me',
  'handled_by_me',
  'supervision',
  'audit_readonly',
]);
export type WorkItemView = z.infer<typeof WorkItemViewSchema>;

export const WorkItemActionSchema = z.enum(['claim', 'complete', 'return', 'assign', 'cancel']);
export type WorkItemAction = z.infer<typeof WorkItemActionSchema>;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const FORBIDDEN_FINANCIAL_METADATA_KEYS = [
  'amount',
  'balance',
  'bank',
  'counterparty',
  'currency',
  'debit',
  'credit',
  'accountcode',
  'accountname',
  'accountline',
  'voucherline',
  'summary',
  'attachment',
  'ocr',
  'comment',
  'auditdetail',
] as const;

function normalizeMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findForbiddenMetadataPath(value: JsonValue, path: readonly string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findForbiddenMetadataPath(value[i] as JsonValue, [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeMetadataKey(key);
    if (FORBIDDEN_FINANCIAL_METADATA_KEYS.some((forbidden) => normalized.includes(forbidden))) {
      return [...path, key].join('.');
    }
    const found = findForbiddenMetadataPath(child as JsonValue, [...path, key]);
    if (found) return found;
  }
  return null;
}

function rejectForbiddenMetadata(value: JsonValue, ctx: z.RefinementCtx): void {
  const forbiddenPath = findForbiddenMetadataPath(value);
  if (forbiddenPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `metadata contains forbidden financial detail at ${forbiddenPath}`,
    });
  }
}

export const SafeWorkItemMetadataSchema = z
  .object({
    sourceEntity: z.string().min(1).max(64).optional(),
    origin: z.string().min(1).max(64).optional(),
    category: z.string().min(1).max(64).optional(),
    trigger: z.string().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((value, ctx) => rejectForbiddenMetadata(value as JsonValue, ctx));
export type SafeWorkItemMetadata = z.infer<typeof SafeWorkItemMetadataSchema>;

export const WorkItemSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  ledgerBookId: z.string().uuid().nullable(),
  moduleKey: z.string().min(1),
  workflowKey: z.string().min(1),
  workflowVersion: z.string().min(1),
  workItemType: z.string().min(1),
  sourceType: z.string().min(1),
  sourceId: z.string().uuid(),
  status: WorkItemStatusSchema,
  subStatus: PlatformSubStatusSchema.or(z.string().min(1)),
  priority: WorkItemPrioritySchema,
  assignedRole: z.string().min(1),
  assigneeUserId: z.string().nullable(),
  claimedAt: z.string().datetime().nullable(),
  availableAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  createdBy: z.string().min(1),
  completedBy: z.string().nullable(),
  version: z.number().int().nonnegative(),
  titleKey: z.string().min(1),
  metadata: SafeWorkItemMetadataSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  availableActions: z.array(WorkItemActionSchema),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const WorkItemEventSchema = z.object({
  id: z.string().uuid(),
  workItemId: z.string().uuid(),
  orgId: z.string().uuid(),
  ledgerBookId: z.string().uuid().nullable(),
  eventType: z.string().min(1),
  actionKey: WorkItemActionSchema.or(z.string().min(1)).nullable(),
  fromStatus: WorkItemStatusSchema.or(z.string().min(1)).nullable(),
  toStatus: WorkItemStatusSchema.or(z.string().min(1)).nullable(),
  actorId: z.string().min(1),
  reason: z.string().nullable(),
  metadata: SafeWorkItemMetadataSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type WorkItemEvent = z.infer<typeof WorkItemEventSchema>;

export const OutboxEventEnvelopeSchema = z
  .object({
    eventType: z.string().min(1),
    orgId: z.string().uuid(),
    ledgerBookId: z.string().uuid().nullable().optional(),
    workItemId: z.string().uuid().optional(),
    moduleKey: z.string().min(1),
    workflowKey: z.string().min(1),
    workflowVersion: z.string().min(1),
    workItemType: z.string().min(1),
    sourceType: z.string().min(1),
    sourceId: z.string().uuid().optional(),
    titleKey: z.string().min(1),
    assignedRole: z.string().min(1),
    assigneeUserId: z.string().nullable().optional(),
    priority: WorkItemPrioritySchema,
    status: WorkItemStatusSchema.optional(),
    subStatus: PlatformSubStatusSchema.or(z.string().min(1)).optional(),
    actionKey: WorkItemActionSchema.optional(),
    deepLink: z.string().max(256).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((value, ctx) => rejectForbiddenMetadata(value as JsonValue, ctx));
export type OutboxEventEnvelope = z.infer<typeof OutboxEventEnvelopeSchema>;

// ---- T-004 capture intake (ERP-INTERNAL contracts; NOT forbidden-key filtered) ----

export const IntakeSourceSchema = z.enum(['web', 'chat', 'email', 'api']);
export type IntakeSource = z.infer<typeof IntakeSourceSchema>;

export const IntakeKindSchema = z.enum(['image', 'pdf', 'text', 'structured']);
export type IntakeKind = z.infer<typeof IntakeKindSchema>;

export const IntakeStatusSchema = z.enum([
  'received',
  'extracting',
  'extracted',
  'drafted',
  'confirmed',
  'discarded',
  'failed',
]);
export type IntakeStatus = z.infer<typeof IntakeStatusSchema>;

export const DocTypeSchema = z.enum(['bank_slip', 'invoice', 'receipt', 'unknown']);
export type DocType = z.infer<typeof DocTypeSchema>;

const MoneyStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'amount must be a numeric string with up to 2 decimals');

function extractionField<T extends z.ZodTypeAny>(value: T) {
  return z.object({ value, confidence: z.number().min(0).max(1) });
}

/**
 * Extractor output — the drop-in contract the mock and the real OCR both satisfy.
 * ERP-INTERNAL: it carries financial detail (amount/counterparty/raw) and MUST NOT
 * be sent toward My-Chat. It is intentionally NOT passed through rejectForbiddenMetadata
 * (that filter guards only the My-Chat outbox envelope and work-item metadata).
 */
export const ExtractionResultSchema = z.object({
  docType: DocTypeSchema.default('unknown'),
  fields: z.object({
    date: extractionField(z.string()).optional(),
    amount: extractionField(MoneyStringSchema).optional(),
    direction: extractionField(z.enum(['in', 'out'])).optional(),
    counterparty: extractionField(z.string()).optional(),
    summary: extractionField(z.string()).optional(),
    docNo: extractionField(z.string()).optional(),
  }),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  raw: z.string().optional(),
  extractor: z.object({ name: z.string().min(1), version: z.string().min(1) }),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** ERP-facing intake detail DTO (authorized ERP users only; includes extraction). */
export const IntakeSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  ledgerBookId: z.string().uuid(),
  source: IntakeSourceSchema,
  kind: IntakeKindSchema,
  status: IntakeStatusSchema,
  attachmentId: z.string().uuid().nullable(),
  extraction: ExtractionResultSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  needsReview: z.boolean(),
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  createdBy: z.string().min(1),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Intake = z.infer<typeof IntakeSchema>;
