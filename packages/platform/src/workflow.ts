import type { Action, Subject } from './ability';
import type { Role } from './identity';

export const WORK_ITEM_STATUSES = [
  'open',
  'claimed',
  'waiting',
  'returned',
  'completed',
  'canceled',
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const PLATFORM_SUB_STATUSES = [
  'pending_completion',
  'pending_confirmation',
  'pending_review',
  'pending_correction',
  'pending_external',
  'pending_system',
  'blocked',
  'ready',
  'done',
] as const;
export type PlatformSubStatus = (typeof PLATFORM_SUB_STATUSES)[number];

export const WORK_ITEM_ACTIONS = ['claim', 'complete', 'return', 'assign', 'cancel'] as const;
export type WorkItemActionKey = (typeof WORK_ITEM_ACTIONS)[number];

export const WORK_ITEM_VIEWS = [
  'my_tasks',
  'role_queue',
  'created_by_me',
  'handled_by_me',
  'supervision',
  'audit_readonly',
] as const;
export type WorkItemView = (typeof WORK_ITEM_VIEWS)[number];

export interface WorkflowActionDefinition {
  readonly key: WorkItemActionKey;
  readonly labelKey: string;
  readonly requiredAction: Action;
  readonly requiredSubject: Subject;
  readonly fromStatuses: readonly WorkItemStatus[];
  readonly toStatus?: WorkItemStatus;
  readonly toSubStatus?: PlatformSubStatus | string;
}

export interface WorkItemTypeDefinition {
  readonly type: string;
  readonly titleKey: string;
  readonly defaultAssignedRole: Role | string;
  readonly defaultSubStatus: PlatformSubStatus | string;
  readonly actions: readonly WorkflowActionDefinition[];
}

export interface WorkflowDefinition {
  readonly moduleKey: string;
  readonly workflowKey: string;
  readonly version: string;
  readonly workItemTypes: readonly WorkItemTypeDefinition[];
}

// Concrete WorkflowDefinition instances are declared runtime-side by each module's
// adapter (finance: apps/api/src/work-items/*-workflow.ts), not in the platform
// kernel. The unused FINANCE_DAILY_ACCOUNTING_WORKFLOW constant was removed in T-009
// (D3); the runtime never read it — voucher-workflow.ts owns the live topology.
