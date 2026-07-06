/**
 * Display labels + tones for the WorkItem task kernel (我的工作台, T-009 restoring
 * T-003 R2-UI). Pure (no React): the platform/contracts layer stays domain-agnostic,
 * so the host maps work-item vocabulary → Chinese labels + Badge tones here.
 */
import type { CardTone } from '@my-erp/ui/contracts';
import type { WorkItemView } from '@my-erp/api-client';

/** workItem.titleKey → display title (workflow-defined keys live module-side). */
export const WORK_ITEM_TITLE: Record<string, string> = {
  'finance.voucher.review': '凭证复核',
  'finance.voucher.confirm': '凭证补全 / 确认',
  'finance.payment.enrich': '收付款补录',
  'finance.payment.approve': '收付款审批',
  'finance.payment.confirm': '收付款确认',
  'finance.fund.consume': '货币资金结算',
};

/** Platform WorkItem.status (lifecycle) → display label. */
export const WORK_ITEM_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  claimed: '处理中',
  waiting: '等待中',
  returned: '已退回',
  completed: '已完成',
  canceled: '已取消',
};

/** Platform WorkItem.subStatus (processing detail) → display label. */
export const WORK_ITEM_SUBSTATUS_LABEL: Record<string, string> = {
  pending_review: '待复核',
  pending_confirmation: '待确认',
  pending_completion: '待补全',
  pending_correction: '待更正',
  pending_external: '待外部',
  pending_system: '待系统',
  pending_accounting: '待补录',
  blocked: '阻塞',
  ready: '就绪',
  done: '已完成',
};

/** WorkItemAction → button label. */
export const WORK_ITEM_ACTION_LABEL: Record<string, string> = {
  claim: '领取',
  complete: '通过并过账',
  cancel: '取消',
  return: '退回',
  assign: '指派',
};

/** WorkItem.status → Badge 语义色（保持 @my-erp/ui 领域无关）。 */
export function workItemStatusTone(status: string): CardTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'canceled':
      return 'muted';
    case 'returned':
      return 'warning';
    case 'waiting':
      return 'info';
    default:
      return 'info';
  }
}

/** The three personal-workbench views surfaced as tabs (待我处理 / 监督 / 我处理过). */
export const WORK_ITEM_VIEW_TABS: readonly {
  readonly key: WorkItemView;
  readonly label: string;
}[] = [
  { key: 'my_tasks', label: '待我处理' },
  { key: 'supervision', label: '监督' },
  { key: 'handled_by_me', label: '我处理过' },
];
