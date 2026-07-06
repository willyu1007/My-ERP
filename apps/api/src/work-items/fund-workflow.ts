import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  consumeFundConsumptionTx,
  createWorkItemWithResultTx,
  getFundConsumptionTx,
  getWorkItemTx,
  transitionWorkItemTx,
  type FundConsumptionEntity,
  type TxClient,
  type WorkItemEntity,
} from '@my-erp/db';
import { SafeWorkItemMetadataSchema } from '@my-erp/contracts';
import type { Identity } from '@my-erp/platform';
import { appendWorkItemOutboxEventTx } from './voucher-workflow';

/**
 * Fund-execution workflow (T-012 Phase 4, D4). When an accountant/manual voucher is
 * posted with a cash/bank line, a cashier fund.consume task opens over that line (one
 * per line) so the cashier records that money actually moved — WITHOUT generating a
 * second voucher (the consume path touches no ledger). Sits on the shared WorkItem
 * kernel next to the cashier + daily-accounting workstreams. Metadata-only outbox.
 */
export const FUND_CONSUME_WORK_ITEM_TYPE = 'fund.consume';

const FUND_WORKFLOW = {
  moduleKey: 'finance',
  workflowKey: 'fund-execution',
  workflowVersion: 'v1',
} as const;

/** Opened on voucher post for each cash/bank line — the cashier's execution queue. */
export async function createFundConsumeWorkItemTx(
  tx: TxClient,
  input: {
    orgId: string;
    ledgerBookId: string;
    voucherId: string;
    voucherLineId: string;
    actorId: string;
  },
): Promise<WorkItemEntity> {
  const result = await createWorkItemWithResultTx(tx, {
    orgId: input.orgId,
    ledgerBookId: input.ledgerBookId,
    moduleKey: FUND_WORKFLOW.moduleKey,
    workflowKey: FUND_WORKFLOW.workflowKey,
    workflowVersion: FUND_WORKFLOW.workflowVersion,
    workItemType: FUND_CONSUME_WORK_ITEM_TYPE,
    sourceType: 'JournalVoucher',
    sourceId: input.voucherId,
    // Per-line dedupe so a multi-cash-line voucher opens one task per line, idempotent on retry.
    dedupeKey: `finance:fund-execution:fund.consume:${input.voucherLineId}`,
    status: 'open',
    subStatus: 'pending_confirmation',
    priority: 'normal',
    assignedRole: 'cashier',
    createdBy: input.actorId,
    titleKey: 'finance.fund.consume',
    metadata: SafeWorkItemMetadataSchema.parse({ sourceEntity: 'JournalVoucher' }),
  });
  if (result.created) await appendWorkItemOutboxEventTx(tx, result.item, 'work_item.created');
  return result.item;
}

export interface ConsumeFundInput {
  /** executed (money moved) | skipped (pure bookkeeping / no cashier movement) */
  executionStatus: 'executed' | 'skipped';
  bankFlowRef?: string | null;
  attachmentId?: string | null;
  reconciliationStatus?: 'unreconciled' | 'reconciled';
  /** REST path supplies the row version; the workbench path uses the loaded version. */
  expectedVersion?: number;
}

/**
 * The single fund-consumption core, shared by the REST endpoint and the workbench
 * `complete` action (mirrors the postVoucherReviewTx pattern). It records execution
 * on the FundConsumption row and completes the paired fund.consume WorkItem —
 * PROVABLY no voucher / no ledger effect (touches only fund_consumption + WorkItem +
 * outbox + audit; the row has no ledger columns). Must run inside withScope.
 */
export async function consumeFundConsumptionWorkflowTx(
  tx: TxClient,
  input: { identity: Identity; ledgerBookId: string; fundConsumptionId: string; body: ConsumeFundInput },
): Promise<FundConsumptionEntity> {
  const { identity } = input;
  const fc = await getFundConsumptionTx(tx, input.fundConsumptionId);
  if (!fc) throw new NotFoundException('fund consumption not found');
  // A non-pending row means someone/something already processed it (concurrent consume,
  // or the source voucher was reversed → void). That is an optimistic-concurrency CONFLICT
  // (409), not a bad request — so a stale client panel gets the soft "已变化，请刷新" refresh
  // path instead of a hard error toast (classifyActionFailure keys on 409).
  if (fc.executionStatus !== 'pending')
    throw new ConflictException(`任务已处理（当前 ${fc.executionStatus}），请刷新`);
  if (input.body.executionStatus !== 'executed' && input.body.executionStatus !== 'skipped')
    throw new BadRequestException('executionStatus 必须是 executed | skipped');

  // Assignment/eligibility gate — kept in this shared core so the REST endpoint and the
  // workbench `complete` action authorize identically (mirrors work-item-rules
  // canCompleteFundConsume). A claimed task belongs to its assignee; an UNCLAIMED task
  // requires role-eligibility for the cashier assignedRole. Supervision-capable overrides
  // both (oversight). Without the unclaimed check, any `consume`-holder — e.g. the
  // accountant who posted the voucher — could execute a cashier fund task, defeating the
  // accountant→cashier separation the task exists to enforce.
  const roles = identity.roles as readonly string[];
  const supervisionCapable = roles.includes('admin') || roles.includes('supervisor');
  const item = fc.workItemId ? await getWorkItemTx(tx, fc.workItemId) : null;
  if (item && !supervisionCapable) {
    if (item.assigneeUserId) {
      if (item.assigneeUserId !== identity.userId)
        throw new ForbiddenException('该出纳任务已被他人领取');
    } else {
      const roleEligible = roles.includes(item.assignedRole) || roles.includes('admin');
      if (!roleEligible) throw new ForbiddenException('该出纳任务需由出纳处理');
    }
  }

  const updated = await consumeFundConsumptionTx(tx, fc.id, {
    expectedVersion: input.body.expectedVersion ?? fc.version,
    executionStatus: input.body.executionStatus,
    bankFlowRef: input.body.bankFlowRef,
    attachmentId: input.body.attachmentId,
    reconciliationStatus: input.body.reconciliationStatus,
    executedBy: identity.userId,
    executedAt: new Date(),
  });
  if (!updated) throw new ConflictException('单据已变化，请刷新');

  // Complete the paired WorkItem (no second voucher; the voucher is already posted).
  if (item && ['open', 'claimed', 'returned', 'waiting'].includes(item.status)) {
    const completed = await transitionWorkItemTx(tx, {
      id: item.id,
      actorId: identity.userId,
      actionKey: 'complete',
      toStatus: 'completed',
      toSubStatus: 'done',
      completedBy: identity.userId,
    });
    if (completed) await appendWorkItemOutboxEventTx(tx, completed, 'work_item.completed', 'complete');
  }

  await appendAuditRecordTx(tx, {
    actorId: identity.userId,
    action: 'CONSUME_FUND',
    entityType: 'FundConsumption',
    entityId: updated.id,
    ledgerBookId: input.ledgerBookId,
    metadata: { executionStatus: updated.executionStatus, voucherId: updated.voucherId },
  });
  return updated;
}
