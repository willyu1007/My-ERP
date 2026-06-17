import { createWorkItemWithResultTx, type TxClient, type WorkItemEntity } from '@my-erp/db';
import { SafeWorkItemMetadataSchema } from '@my-erp/contracts';
import { appendWorkItemOutboxEventTx } from '../work-items/voucher-workflow';

/**
 * Cashier payment workflow tasks (T-007) on the shared WorkItem kernel — the
 * payment workstream coexists with the voucher workstream (T-003 R3 goal). The
 * approve/confirm actions happen on the payment endpoints (MVP); these tasks give
 * the role queues + workbench visibility + metadata-only outbox correlation.
 */
export const PAYMENT_APPROVE_WORK_ITEM_TYPE = 'payment.approve';
export const PAYMENT_CONFIRM_WORK_ITEM_TYPE = 'payment.confirm';

const CASHIER_WORKFLOW = { moduleKey: 'finance', workflowKey: 'cashier', workflowVersion: 'v1' } as const;

async function createPaymentWorkItemTx(
  tx: TxClient,
  input: {
    orgId: string;
    ledgerBookId: string;
    paymentId: string;
    actorId: string;
    workItemType: string;
    assignedRole: string;
    subStatus: string;
    titleKey: string;
  },
): Promise<WorkItemEntity> {
  const result = await createWorkItemWithResultTx(tx, {
    orgId: input.orgId,
    ledgerBookId: input.ledgerBookId,
    moduleKey: CASHIER_WORKFLOW.moduleKey,
    workflowKey: CASHIER_WORKFLOW.workflowKey,
    workflowVersion: CASHIER_WORKFLOW.workflowVersion,
    workItemType: input.workItemType,
    sourceType: 'PaymentDoc',
    sourceId: input.paymentId,
    dedupeKey: `finance:cashier:${input.workItemType}:${input.paymentId}`,
    status: 'open',
    subStatus: input.subStatus,
    priority: 'normal',
    assignedRole: input.assignedRole,
    createdBy: input.actorId,
    titleKey: input.titleKey,
    metadata: SafeWorkItemMetadataSchema.parse({ sourceEntity: 'PaymentDoc' }),
  });
  if (result.created) await appendWorkItemOutboxEventTx(tx, result.item, 'work_item.created');
  return result.item;
}

/** Opened on submit — the approver's queue (assignedRole supervisor). */
export function createPaymentApproveWorkItemTx(
  tx: TxClient,
  input: { orgId: string; ledgerBookId: string; paymentId: string; actorId: string },
): Promise<WorkItemEntity> {
  return createPaymentWorkItemTx(tx, {
    ...input,
    workItemType: PAYMENT_APPROVE_WORK_ITEM_TYPE,
    assignedRole: 'supervisor',
    subStatus: 'pending_review',
    titleKey: 'finance.payment.approve',
  });
}

/** Opened on approve — the cashier's queue (assignedRole cashier). */
export function createPaymentConfirmWorkItemTx(
  tx: TxClient,
  input: { orgId: string; ledgerBookId: string; paymentId: string; actorId: string },
): Promise<WorkItemEntity> {
  return createPaymentWorkItemTx(tx, {
    ...input,
    workItemType: PAYMENT_CONFIRM_WORK_ITEM_TYPE,
    assignedRole: 'cashier',
    subStatus: 'pending_confirmation',
    titleKey: 'finance.payment.confirm',
  });
}
