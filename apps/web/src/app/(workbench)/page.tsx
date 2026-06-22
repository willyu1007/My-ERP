import {
  EntityRow,
  Hub,
  IconBook,
  IconClipboard,
  type DashAttention,
  type WorkflowModule,
} from '@my-erp/ui';
import type { WorkItem } from '@my-erp/api-client';
import { listPayments, listVouchers, listWorkItems } from '@/lib/finance/data-source';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { WORK_ITEM_SUBSTATUS_LABEL, WORK_ITEM_TITLE } from '@/lib/finance/work-item-display';
import {
  resolveWorkItemRef,
  workItemDeepLink,
  type WorkItemSourceRef,
} from '@/lib/finance/work-item-source';
import { VOUCHER_STATUS_LABELS, type VoucherVM } from '@/lib/finance/types';

/**
 * Map a kernel work item → a Hub 待办. The attention list is sourced from the
 * WorkItem task kernel (`my_tasks`), NOT derived from voucher status (T-009) — the
 * voucher stats below remain legitimate read-model counts.
 */
function attentionFromTask(it: WorkItem, ref: WorkItemSourceRef | null): DashAttention {
  const title = WORK_ITEM_TITLE[it.titleKey] ?? it.titleKey;
  const tone: DashAttention['tone'] =
    it.subStatus === 'pending_review'
      ? 'accent'
      : it.subStatus === 'pending_confirmation' || it.subStatus === 'pending_completion'
        ? 'warning'
        : 'info';
  const isPayment = it.sourceType === 'PaymentDoc';
  const actions = it.availableActions ?? [];
  const cta = actions.includes('complete') ? '去处理' : actions.includes('claim') ? '去领取' : '去查看';
  return {
    id: it.id,
    title: ref ? `${ref.no} ${title}` : title,
    detail: ref
      ? `${formatDate(ref.date)} · ${ref.summary} · ${formatMoney(ref.amount)} CNY`
      : (WORK_ITEM_SUBSTATUS_LABEL[it.subStatus] ?? '待处理'),
    tone,
    href: workItemDeepLink(it.sourceType, it.sourceId),
    cta,
    workflow: isPayment ? '收付' : '凭证',
  };
}

function financeModule(
  vouchers: readonly VoucherVM[],
  attention: readonly DashAttention[],
): WorkflowModule {
  const draft = vouchers.filter((v) => v.status === 'draft');
  const pending = vouchers.filter((v) => v.status === 'pending');
  const posted = vouchers.filter((v) => v.status === 'posted');
  const reversed = vouchers.filter((v) => v.status === 'reversed');

  return {
    key: 'finance-vouchers',
    label: '凭证',
    accent: 'accent',
    stats: [
      { label: '待处理', value: draft.length + pending.length },
      { label: '待补全', value: draft.length },
      { label: '待审核', value: pending.length },
      { label: '本期已过账', value: posted.length },
    ],
    attention,
    highlights: [
      {
        title: '本期概览',
        link: { href: '/finance/daily-accounting', label: '进入凭证处理' },
        body: (
          <div className="wb-list wb-list--framed">
            <EntityRow
              model={{
                href: '/finance/workbench',
                title: '我的工作台',
                note: '从内核派发的待办队列继续处理（待我处理 / 监督 / 我处理过）。',
                metrics: [{ label: '我的待办', value: attention.length }],
                status: { tone: 'warning', label: '待处理' },
              }}
            />
            <EntityRow
              model={{
                href: '/finance/ledger',
                title: '账簿查询',
                note: '查看本期已过账凭证形成的账簿与余额。',
                metrics: [{ label: '已过账', value: posted.length }],
                status: { tone: 'success', label: VOUCHER_STATUS_LABELS.posted },
              }}
            />
            <EntityRow
              model={{
                title: '纠错留痕',
                note: '纠错只通过作废或红冲保留痕迹，不提供物理删除入口。',
                metrics: [{ label: '已红冲', value: reversed.length }],
                status: {
                  tone: reversed.length > 0 ? 'danger' : 'muted',
                  label: VOUCHER_STATUS_LABELS.reversed,
                },
              }}
            />
          </div>
        ),
      },
    ],
    quickActions: [
      { href: '/finance/daily-accounting', label: '录入凭证', icon: <IconClipboard size={15} /> },
      { href: '/finance/ledger', label: '账簿查询', icon: <IconBook size={15} /> },
    ],
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [vouchers, payments, workItems] = await Promise.all([
    listVouchers(),
    listPayments(),
    listWorkItems('my_tasks'),
  ]);
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const attention = workItems.map((it) =>
    attentionFromTask(it, resolveWorkItemRef(it, voucherById, paymentById)),
  );

  return <Hub modules={[financeModule(vouchers, attention)]} />;
}
