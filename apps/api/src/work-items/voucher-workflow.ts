import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  appendOutboxEventTx,
  completeActiveWorkItemsForSourceTx,
  createFundConsumptionTx,
  createWorkItemWithResultTx,
  getVoucherTx,
  isPeriodClosedTx,
  isSettlementVoucherTx,
  setVoucherStatusTx,
  transitionWorkItemTx,
  updateFundConsumptionWorkItemRefTx,
  type LedgerBookEntity,
  type TxClient,
  type VoucherEntity,
  type WorkItemEntity,
} from '@my-erp/db';
import { OutboxEventEnvelopeSchema, SafeWorkItemMetadataSchema } from '@my-erp/contracts';
import { isCashAccountCode, voucherBalanceError } from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';
import { createFundConsumeWorkItemTx } from './fund-workflow';

export const VOUCHER_REVIEW_WORK_ITEM_TYPE = 'voucher.review';
export const VOUCHER_REVIEW_WORKFLOW = {
  moduleKey: 'finance',
  workflowKey: 'daily-accounting',
  workflowVersion: 'v1',
  titleKey: 'finance.voucher.review',
  assignedRole: 'supervisor',
} as const;

/** ERP deep link by source type (the web routes used by the workbench). */
function sourceDeepLink(sourceType: string, sourceId: string): string | undefined {
  if (sourceType === 'JournalVoucher') return `/finance/vouchers/${sourceId}`;
  if (sourceType === 'PaymentDoc') return `/finance/payments/${sourceId}`;
  return undefined;
}

export async function appendWorkItemOutboxEventTx(
  tx: TxClient,
  item: WorkItemEntity,
  eventType: string,
  actionKey?: 'claim' | 'complete' | 'return' | 'assign' | 'cancel',
): Promise<void> {
  const payload = OutboxEventEnvelopeSchema.parse({
    eventType,
    orgId: item.orgId,
    ledgerBookId: item.ledgerBookId,
    workItemId: item.id,
    moduleKey: item.moduleKey,
    workflowKey: item.workflowKey,
    workflowVersion: item.workflowVersion,
    workItemType: item.workItemType,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    titleKey: item.titleKey,
    assignedRole: item.assignedRole,
    assigneeUserId: item.assigneeUserId,
    priority: item.priority,
    status: item.status,
    subStatus: item.subStatus,
    ...(actionKey ? { actionKey } : {}),
    deepLink: sourceDeepLink(item.sourceType, item.sourceId),
    occurredAt: new Date().toISOString(),
  });

  await appendOutboxEventTx(tx, {
    orgId: item.orgId,
    ledgerBookId: item.ledgerBookId,
    workItemId: item.id,
    eventType,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    payload,
  });
}

export async function createVoucherReviewWorkItemTx(
  tx: TxClient,
  input: {
    orgId: string;
    ledgerBookId: string;
    voucherId: string;
    actorId: string;
  },
): Promise<WorkItemEntity> {
  const result = await createWorkItemWithResultTx(tx, {
    orgId: input.orgId,
    ledgerBookId: input.ledgerBookId,
    moduleKey: VOUCHER_REVIEW_WORKFLOW.moduleKey,
    workflowKey: VOUCHER_REVIEW_WORKFLOW.workflowKey,
    workflowVersion: VOUCHER_REVIEW_WORKFLOW.workflowVersion,
    workItemType: VOUCHER_REVIEW_WORK_ITEM_TYPE,
    sourceType: 'JournalVoucher',
    sourceId: input.voucherId,
    dedupeKey: `finance:daily-accounting:${VOUCHER_REVIEW_WORK_ITEM_TYPE}:${input.voucherId}`,
    status: 'open',
    subStatus: 'pending_review',
    priority: 'normal',
    assignedRole: VOUCHER_REVIEW_WORKFLOW.assignedRole,
    createdBy: input.actorId,
    titleKey: VOUCHER_REVIEW_WORKFLOW.titleKey,
    metadata: SafeWorkItemMetadataSchema.parse({ sourceEntity: 'JournalVoucher' }),
  });
  if (result.created) {
    await appendWorkItemOutboxEventTx(tx, result.item, 'work_item.created');
  }
  return result.item;
}

export const VOUCHER_CONFIRM_WORK_ITEM_TYPE = 'voucher.confirm';

/** A capture-generated voucher draft awaiting accountant confirmation (T-004 S5).
 *  Completing it = submitting the draft (draft → pending); posting stays in the
 *  review queue. subStatus routes by confidence/completeness. */
export async function createVoucherConfirmWorkItemTx(
  tx: TxClient,
  input: {
    orgId: string;
    ledgerBookId: string;
    voucherId: string;
    actorId: string;
    subStatus: 'pending_confirmation' | 'pending_completion';
  },
): Promise<WorkItemEntity> {
  const result = await createWorkItemWithResultTx(tx, {
    orgId: input.orgId,
    ledgerBookId: input.ledgerBookId,
    moduleKey: VOUCHER_REVIEW_WORKFLOW.moduleKey,
    workflowKey: VOUCHER_REVIEW_WORKFLOW.workflowKey,
    workflowVersion: VOUCHER_REVIEW_WORKFLOW.workflowVersion,
    workItemType: VOUCHER_CONFIRM_WORK_ITEM_TYPE,
    sourceType: 'JournalVoucher',
    sourceId: input.voucherId,
    dedupeKey: `finance:daily-accounting:${VOUCHER_CONFIRM_WORK_ITEM_TYPE}:${input.voucherId}`,
    status: 'open',
    subStatus: input.subStatus,
    priority: 'normal',
    assignedRole: 'accountant',
    createdBy: input.actorId,
    titleKey: 'finance.voucher.confirm',
    metadata: SafeWorkItemMetadataSchema.parse({
      sourceEntity: 'JournalVoucher',
      origin: 'capture',
    }),
  });
  if (result.created) {
    await appendWorkItemOutboxEventTx(tx, result.item, 'work_item.created');
  }
  return result.item;
}

export async function postVoucherReviewTx(
  tx: TxClient,
  input: {
    ledgerBookId: string;
    book: LedgerBookEntity;
    identity: Identity;
    voucherId: string;
    confirmSinglePerson: boolean;
    workItemId?: string;
    expectedWorkItemVersion?: number;
  },
): Promise<VoucherEntity> {
  const voucher = await getVoucherTx(tx, input.voucherId);
  if (!voucher) throw new NotFoundException('voucher not found');
  if (voucher.status !== 'pending')
    throw new BadRequestException(`cannot post a ${voucher.status} voucher`);
  if (await isPeriodClosedTx(tx, voucher.period))
    throw new BadRequestException('会计期间已结账，请先反结账');
  const error = voucherBalanceError(voucher.lines);
  if (error) throw new BadRequestException(error);

  const selfPost = voucher.maker === input.identity.userId;
  if (selfPost && !(input.book.singlePersonMode && input.confirmSinglePerson)) {
    throw new ForbiddenException(
      'the maker cannot post their own voucher (职责分离); enable single-person mode and confirm to override',
    );
  }

  await setVoucherStatusTx(tx, input.voucherId, {
    status: 'posted',
    checker: input.identity.userId,
    postedAt: new Date(),
  });
  await appendAuditRecordTx(tx, {
    actorId: input.identity.userId,
    action: selfPost ? 'POST_VOUCHER_SINGLE_PERSON' : 'POST_VOUCHER',
    entityType: 'Voucher',
    entityId: input.voucherId,
    ledgerBookId: input.ledgerBookId,
    ...(selfPost ? { metadata: { singlePerson: true } } : {}),
  });

  const completedItems: WorkItemEntity[] = [];
  if (input.workItemId) {
    const completed = await transitionWorkItemTx(tx, {
      id: input.workItemId,
      actorId: input.identity.userId,
      actionKey: 'complete',
      toStatus: 'completed',
      toSubStatus: 'done',
      completedBy: input.identity.userId,
      expectedVersion: input.expectedWorkItemVersion,
    });
    if (!completed) {
      throw new ConflictException('work item is no longer actionable');
    }
    completedItems.push(completed);
  } else {
    completedItems.push(
      ...(await completeActiveWorkItemsForSourceTx(tx, {
        sourceType: 'JournalVoucher',
        sourceId: input.voucherId,
        actorId: input.identity.userId,
        actionKey: 'complete',
        workItemType: VOUCHER_REVIEW_WORK_ITEM_TYPE,
      })),
    );
  }

  for (const item of completedItems) {
    await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
  }

  const posted = await getVoucherTx(tx, input.voucherId);
  if (!posted) throw new NotFoundException('voucher not found');

  // T-012 Phase 4 (D4): each cash/bank line on this accountant/manual voucher spawns a
  // cashier fund-consumption task so the cashier records that money actually moved —
  // WITHOUT any second voucher / ledger effect (FundConsumption has no ledger columns).
  // Settlement vouchers from the cashier payment flow never reach here (posted directly
  // by confirm(), never 'pending'); reversal originals are skipped. Belt-and-suspenders:
  // the isSettlementVoucherTx guard also excludes any doc-linked settlement voucher.
  if (!posted.reversalOf && !(await isSettlementVoucherTx(tx, posted.id))) {
    for (const line of posted.lines) {
      if (!isCashAccountCode(line.accountCode)) continue;
      const fc = await createFundConsumptionTx(tx, {
        ledgerBookId: input.ledgerBookId,
        orgId: input.identity.orgId,
        voucherId: posted.id,
        voucherLineId: line.id,
        voucherNo: posted.no,
        lineNo: line.lineNo,
        accountCode: line.accountCode,
        accountName: line.accountName,
        // 借 cash → money in (receipt); 贷 cash → money out (payment).
        direction: line.debit ? 'inflow' : 'outflow',
        amount: line.debit ?? line.credit ?? '0.00',
        summary: line.summary || posted.summary,
        createdBy: input.identity.userId,
      });
      const item = await createFundConsumeWorkItemTx(tx, {
        orgId: input.identity.orgId,
        ledgerBookId: input.ledgerBookId,
        voucherId: posted.id,
        voucherLineId: line.id,
        actorId: input.identity.userId,
      });
      await updateFundConsumptionWorkItemRefTx(tx, fc.id, item.id);
    }
  }

  return posted;
}
