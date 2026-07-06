import { defineAbilityFor, type Identity } from '@my-erp/platform';
import type { WorkItemAction } from '@my-erp/contracts';
import type { WorkItemEntity } from '@my-erp/db';

export interface VoucherActionState {
  readonly status: string;
  readonly maker: string;
}

export interface LedgerActionState {
  readonly singlePersonMode: boolean;
}

export interface FundConsumptionActionState {
  readonly executionStatus: string;
}

export interface WorkItemRuleContext {
  readonly item: WorkItemEntity;
  readonly identity: Identity;
  readonly handledByUser?: boolean;
  readonly voucher?: VoucherActionState | null;
  readonly ledger?: LedgerActionState | null;
  readonly fundConsumption?: FundConsumptionActionState | null;
}

function hasRole(identity: Identity, role: string): boolean {
  return (identity.roles as readonly string[]).includes(role);
}

export function canUseSupervisionView(identity: Identity): boolean {
  return hasRole(identity, 'admin') || hasRole(identity, 'supervisor');
}

export function canUseAuditReadonlyView(identity: Identity): boolean {
  return canUseSupervisionView(identity);
}

function inIdentityScope(item: WorkItemEntity, identity: Identity): boolean {
  if (item.orgId !== identity.orgId) return false;
  return !item.ledgerBookId || item.ledgerBookId === identity.ledgerBookId;
}

export function canViewWorkItem(
  item: WorkItemEntity,
  identity: Identity,
  handledByUser = false,
): boolean {
  if (!inIdentityScope(item, identity)) return false;
  if (!defineAbilityFor(identity).can('read', 'WorkItem')) return false;
  if (canUseSupervisionView(identity)) return true;
  return (
    item.assigneeUserId === identity.userId ||
    hasRole(identity, item.assignedRole) ||
    item.createdBy === identity.userId ||
    handledByUser
  );
}

function isActive(item: WorkItemEntity): boolean {
  return ['open', 'claimed', 'waiting', 'returned'].includes(item.status);
}

function canCompleteVoucherReview(ctx: WorkItemRuleContext): boolean {
  const { item, identity, voucher, ledger } = ctx;
  if (!voucher || voucher.status !== 'pending') return false;
  if (!['open', 'claimed', 'returned'].includes(item.status)) return false;

  const assignedToMe = item.assigneeUserId === identity.userId;
  const roleEligible = hasRole(identity, item.assignedRole) || hasRole(identity, 'admin');
  const canActOnAssignment = assignedToMe || (!item.assigneeUserId && roleEligible);
  if (!canActOnAssignment) return false;
  if (!defineAbilityFor(identity).can('post', 'Voucher')) return false;

  const selfPost = voucher.maker === identity.userId;
  return !selfPost || Boolean(ledger?.singlePersonMode);
}

/**
 * T-012 Phase 4 (D4): a cashier may complete a fund.consume task if they own/are
 * role-eligible for it, the fund line is still pending, and they hold the `consume`
 * FundConsumption capability. NO `post Voucher` gate (the voucher is already posted and
 * immutable to the cashier; consuming posts nothing) and NO maker≠checker SoD (this is a
 * downstream execution step, not the accounting post).
 */
function canCompleteFundConsume(ctx: WorkItemRuleContext): boolean {
  const { item, identity, fundConsumption } = ctx;
  if (!fundConsumption || fundConsumption.executionStatus !== 'pending') return false;
  if (!['open', 'claimed', 'returned'].includes(item.status)) return false;

  const assignedToMe = item.assigneeUserId === identity.userId;
  const roleEligible = hasRole(identity, item.assignedRole) || hasRole(identity, 'admin');
  const canActOnAssignment = assignedToMe || (!item.assigneeUserId && roleEligible);
  if (!canActOnAssignment) return false;
  return defineAbilityFor(identity).can('consume', 'FundConsumption');
}

export function availableWorkItemActions(ctx: WorkItemRuleContext): WorkItemAction[] {
  const { item, identity } = ctx;
  const ability = defineAbilityFor(identity);
  if (!canViewWorkItem(item, identity, ctx.handledByUser) || !isActive(item)) return [];

  const roleEligible = hasRole(identity, item.assignedRole) || hasRole(identity, 'admin');
  const actions: WorkItemAction[] = [];

  if (
    (item.status === 'open' || item.status === 'returned') &&
    !item.assigneeUserId &&
    roleEligible &&
    ability.can('claim', 'WorkItem')
  ) {
    actions.push('claim');
  }

  if (
    item.sourceType === 'JournalVoucher' &&
    item.workItemType === 'voucher.review' &&
    canCompleteVoucherReview(ctx)
  ) {
    actions.push('complete');
  }

  if (
    item.sourceType === 'JournalVoucher' &&
    item.workItemType === 'fund.consume' &&
    canCompleteFundConsume(ctx)
  ) {
    actions.push('complete');
  }

  if (canUseSupervisionView(identity) && ability.can('cancel', 'WorkItem')) {
    actions.push('cancel');
  }

  return actions;
}
