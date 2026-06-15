import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  cancelWorkItemTx,
  claimWorkItemTx,
  getLedgerBookByIdTx,
  getWorkItemTx,
  getVoucherTx,
  hasWorkItemEventByActorTx,
  listWorkItemsTx,
  withOptionalLedgerScope,
  type TxClient,
  type WorkItemEntity,
} from '@my-erp/db';
import {
  WorkItemActionSchema,
  WorkItemSchema,
  WorkItemStatusSchema,
  WorkItemViewSchema,
  type WorkItem,
  type WorkItemAction,
  type WorkItemView,
} from '@my-erp/contracts';
import { type Identity } from '@my-erp/platform';
import {
  availableWorkItemActions,
  canUseAuditReadonlyView,
  canUseSupervisionView,
  canViewWorkItem,
} from './work-item-rules';
import {
  appendWorkItemOutboxEventTx,
  postVoucherReviewTx,
  VOUCHER_REVIEW_WORK_ITEM_TYPE,
} from './voucher-workflow';

interface ListWorkItemsQuery {
  view?: string;
  status?: string;
  sourceType?: string;
  sourceId?: string;
  limit?: string;
  cursor?: string;
}

interface WorkItemActionBody {
  expectedVersion?: number;
  confirmSinglePerson?: boolean;
  reason?: string;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toDto(item: WorkItemEntity, availableActions: readonly WorkItemAction[]): WorkItem {
  return WorkItemSchema.parse({
    id: item.id,
    orgId: item.orgId,
    ledgerBookId: item.ledgerBookId,
    moduleKey: item.moduleKey,
    workflowKey: item.workflowKey,
    workflowVersion: item.workflowVersion,
    workItemType: item.workItemType,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    status: item.status,
    subStatus: item.subStatus,
    priority: item.priority,
    assignedRole: item.assignedRole,
    assigneeUserId: item.assigneeUserId,
    claimedAt: iso(item.claimedAt),
    availableAt: item.availableAt.toISOString(),
    dueAt: iso(item.dueAt),
    completedAt: iso(item.completedAt),
    canceledAt: iso(item.canceledAt),
    createdBy: item.createdBy,
    completedBy: item.completedBy,
    version: item.version,
    titleKey: item.titleKey,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    availableActions,
  });
}

function parseView(value: string | undefined): WorkItemView {
  if (!value) return 'my_tasks';
  const parsed = WorkItemViewSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('invalid work item view');
  return parsed.data;
}

function parseAction(value: string): WorkItemAction {
  const parsed = WorkItemActionSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('invalid work item action');
  return parsed.data;
}

function parseStatus(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = WorkItemStatusSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('invalid work item status');
  return parsed.data;
}

function parseUuidFilter(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`invalid ${name}`);
  }
  return value;
}

function parseLimit(value: string | undefined): number {
  if (!value) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestException('limit must be an integer between 1 and 100');
  }
  return limit;
}

function parseBody(body: unknown, action: WorkItemAction): WorkItemActionBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(b.expectedVersion) || (b.expectedVersion as number) < 0) {
    throw new BadRequestException(`${action} requires expectedVersion`);
  }
  return {
    expectedVersion: b.expectedVersion as number,
    confirmSinglePerson: Boolean(b.confirmSinglePerson),
    reason: typeof b.reason === 'string' ? b.reason : undefined,
  };
}

@Injectable()
export class WorkItemsService {
  async list(identity: Identity, query: ListWorkItemsQuery): Promise<WorkItem[]> {
    const view = parseView(query.view);
    const status = parseStatus(query.status);
    const sourceId = parseUuidFilter(query.sourceId, 'sourceId');
    const cursor = parseUuidFilter(query.cursor, 'cursor');
    const limit = parseLimit(query.limit);
    this.assertViewAllowed(identity, view);

    return withOptionalLedgerScope(identity.orgId, identity.ledgerBookId, async (tx) => {
      const items = await listWorkItemsTx(tx, {
        view,
        actorId: identity.userId,
        roles: identity.roles,
        status,
        sourceType: query.sourceType,
        sourceId,
        limit,
        cursor,
        includeClosed: view === 'handled_by_me' || view === 'audit_readonly',
      });
      const visible = items.filter((item) =>
        canViewWorkItem(item, identity, view === 'handled_by_me'),
      );
      return Promise.all(
        visible.map(async (item) =>
          toDto(item, await this.availableActionsTx(tx, item, identity, view === 'handled_by_me')),
        ),
      );
    });
  }

  async detail(identity: Identity, id: string): Promise<WorkItem> {
    const workItemId = parseUuidFilter(id, 'id') as string;
    return withOptionalLedgerScope(identity.orgId, identity.ledgerBookId, async (tx) => {
      const item = await getWorkItemTx(tx, workItemId);
      if (!item) throw new NotFoundException('work item not found');
      const handledByUser = await hasWorkItemEventByActorTx(tx, item.id, identity.userId);
      if (!canViewWorkItem(item, identity, handledByUser)) {
        throw new NotFoundException('work item not found');
      }
      return toDto(item, await this.availableActionsTx(tx, item, identity, handledByUser));
    });
  }

  async act(
    identity: Identity,
    id: string,
    rawAction: string,
    rawBody: unknown,
  ): Promise<{ workItem: WorkItem; source?: unknown }> {
    const workItemId = parseUuidFilter(id, 'id') as string;
    const action = parseAction(rawAction);
    const body = parseBody(rawBody, action);

    return withOptionalLedgerScope(identity.orgId, identity.ledgerBookId, async (tx) => {
      const item = await getWorkItemTx(tx, workItemId);
      if (!item) throw new NotFoundException('work item not found');
      const handledByUser = await hasWorkItemEventByActorTx(tx, item.id, identity.userId);
      if (!canViewWorkItem(item, identity, handledByUser)) {
        throw new NotFoundException('work item not found');
      }
      const actions = await this.availableActionsTx(tx, item, identity, handledByUser);
      if (!actions.includes(action)) {
        throw new ForbiddenException(`work item action is not available: ${action}`);
      }

      if (action === 'claim') {
        const claimed = await claimWorkItemTx(
          tx,
          workItemId,
          identity.userId,
          body.expectedVersion,
        );
        if (!claimed) throw new ConflictException('work item is no longer claimable');
        await appendWorkItemOutboxEventTx(tx, claimed, 'work_item.claimed', 'claim');
        return {
          workItem: toDto(
            claimed,
            await this.availableActionsTx(tx, claimed, identity, handledByUser),
          ),
        };
      }

      if (action === 'cancel') {
        const canceled = await cancelWorkItemTx(
          tx,
          workItemId,
          identity.userId,
          body.expectedVersion,
        );
        if (!canceled) throw new ConflictException('work item is no longer cancelable');
        await appendWorkItemOutboxEventTx(tx, canceled, 'work_item.canceled', 'cancel');
        return { workItem: toDto(canceled, []) };
      }

      if (action === 'complete') {
        if (
          item.sourceType !== 'JournalVoucher' ||
          item.workItemType !== VOUCHER_REVIEW_WORK_ITEM_TYPE
        ) {
          throw new BadRequestException('complete is not implemented for this work item source');
        }
        if (!item.ledgerBookId)
          throw new BadRequestException('voucher task is missing ledger scope');
        const book = await getLedgerBookByIdTx(tx, item.ledgerBookId);
        if (!book) throw new ForbiddenException('ledger book not found in your organization');
        const voucher = await postVoucherReviewTx(tx, {
          ledgerBookId: item.ledgerBookId,
          book,
          identity,
          voucherId: item.sourceId,
          confirmSinglePerson: body.confirmSinglePerson ?? false,
          workItemId: item.id,
          expectedWorkItemVersion: body.expectedVersion,
        });
        const completed = await getWorkItemTx(tx, workItemId);
        if (!completed) throw new NotFoundException('work item not found');
        return {
          workItem: toDto(completed, await this.availableActionsTx(tx, completed, identity, true)),
          source: voucher,
        };
      }

      throw new BadRequestException(`action is not implemented: ${action}`);
    });
  }

  private assertViewAllowed(identity: Identity, view: WorkItemView): void {
    if (view === 'supervision' && !canUseSupervisionView(identity)) {
      throw new ForbiddenException('supervision view requires supervisor permission');
    }
    if (view === 'audit_readonly' && !canUseAuditReadonlyView(identity)) {
      throw new ForbiddenException('audit_readonly view requires audit permission');
    }
  }

  private async availableActionsTx(
    tx: TxClient,
    item: WorkItemEntity,
    identity: Identity,
    handledByUser: boolean,
  ): Promise<WorkItemAction[]> {
    if (
      item.sourceType !== 'JournalVoucher' ||
      item.workItemType !== VOUCHER_REVIEW_WORK_ITEM_TYPE
    ) {
      return availableWorkItemActions({ item, identity, handledByUser });
    }
    const voucher = await getVoucherTx(tx, item.sourceId);
    const ledger = item.ledgerBookId ? await getLedgerBookByIdTx(tx, item.ledgerBookId) : null;
    return availableWorkItemActions({
      item,
      identity,
      handledByUser,
      voucher: voucher ? { status: voucher.status, maker: voucher.maker } : null,
      ledger: ledger ? { singlePersonMode: ledger.singlePersonMode } : null,
    });
  }
}
