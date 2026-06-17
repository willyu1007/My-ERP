import { OutboxEventEnvelopeSchema, type OutboxEventEnvelope } from '@my-erp/contracts';
import { appendOutboxEventTx, type IntakeEntity, type TxClient } from '@my-erp/db';

export const INTAKE_SOURCE_TYPE = 'Intake';

function intakeDeepLink(_intakeId: string): string {
  // Intakes have no per-id detail route; a captured draft is confirmed in 凭证处理.
  return `/finance/daily-accounting`;
}

/**
 * Metadata-only outbox envelope for an intake lifecycle event. No financial
 * detail (amount/counterparty/extraction/OCR) ever enters the payload — the
 * envelope is the same forbidden-key-filtered schema the work-item events use.
 */
export function buildIntakeOutboxEnvelope(
  intake: IntakeEntity,
  eventType: string,
  occurredAt: string,
): OutboxEventEnvelope {
  const phase = eventType.split('.')[1] ?? 'event';
  return OutboxEventEnvelopeSchema.parse({
    eventType,
    orgId: intake.orgId,
    ledgerBookId: intake.ledgerBookId,
    moduleKey: 'finance',
    workflowKey: 'daily-accounting',
    workflowVersion: 'v1',
    workItemType: 'voucher.confirm',
    sourceType: INTAKE_SOURCE_TYPE,
    sourceId: intake.id,
    titleKey: `finance.intake.${phase}`,
    assignedRole: 'accountant',
    priority: 'normal',
    deepLink: intakeDeepLink(intake.id),
    occurredAt,
  });
}

export async function appendIntakeOutboxEventTx(
  tx: TxClient,
  intake: IntakeEntity,
  eventType: string,
  occurredAt: string,
): Promise<void> {
  const payload = buildIntakeOutboxEnvelope(intake, eventType, occurredAt);
  await appendOutboxEventTx(tx, {
    orgId: intake.orgId,
    ledgerBookId: intake.ledgerBookId,
    eventType,
    sourceType: INTAKE_SOURCE_TYPE,
    sourceId: intake.id,
    payload,
  });
}
