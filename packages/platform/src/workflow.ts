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

export const FINANCE_DAILY_ACCOUNTING_WORKFLOW: WorkflowDefinition = {
  moduleKey: 'finance',
  workflowKey: 'daily-accounting',
  version: 'v1',
  workItemTypes: [
    {
      type: 'voucher.review',
      titleKey: 'finance.voucher.review',
      defaultAssignedRole: 'supervisor',
      defaultSubStatus: 'pending_review',
      actions: [
        {
          key: 'claim',
          labelKey: 'workflow.action.claim',
          requiredAction: 'claim',
          requiredSubject: 'WorkItem',
          fromStatuses: ['open', 'returned'],
          toStatus: 'claimed',
        },
        {
          key: 'complete',
          labelKey: 'finance.voucher.action.post',
          requiredAction: 'post',
          requiredSubject: 'Voucher',
          fromStatuses: ['open', 'claimed', 'returned'],
          toStatus: 'completed',
          toSubStatus: 'done',
        },
        {
          key: 'cancel',
          labelKey: 'workflow.action.cancel',
          requiredAction: 'cancel',
          requiredSubject: 'WorkItem',
          fromStatuses: ['open', 'claimed', 'waiting', 'returned'],
          toStatus: 'canceled',
        },
      ],
    },
    {
      // T-004: a generated/imported voucher draft awaiting accountant confirmation
      // (capture → posting template → draft). Completing it submits the draft
      // (draft → pending); posting still happens later in the review queue (SoD).
      type: 'voucher.confirm',
      titleKey: 'finance.voucher.confirm',
      defaultAssignedRole: 'accountant',
      defaultSubStatus: 'pending_confirmation',
      actions: [
        {
          key: 'claim',
          labelKey: 'workflow.action.claim',
          requiredAction: 'claim',
          requiredSubject: 'WorkItem',
          fromStatuses: ['open', 'returned'],
          toStatus: 'claimed',
        },
        {
          key: 'complete',
          labelKey: 'finance.voucher.action.confirm',
          requiredAction: 'update',
          requiredSubject: 'Voucher',
          fromStatuses: ['open', 'claimed', 'returned'],
          toStatus: 'completed',
          toSubStatus: 'done',
        },
        {
          key: 'cancel',
          labelKey: 'finance.voucher.action.discard',
          requiredAction: 'cancel',
          requiredSubject: 'WorkItem',
          fromStatuses: ['open', 'claimed', 'waiting', 'returned'],
          toStatus: 'canceled',
        },
      ],
    },
  ],
};
