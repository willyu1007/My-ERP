'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { EntityRow } from '@my-erp/ui/list';
import type { RowModel } from '@my-erp/ui/contracts';
import type { WorkItemAction } from '@my-erp/api-client';
import { formatMoney } from '@/lib/finance/format';
import type { WorkItemSourceRef } from '@/lib/finance/work-item-source';
import {
  WORK_ITEM_ACTION_LABEL,
  WORK_ITEM_STATUS_LABEL,
  WORK_ITEM_SUBSTATUS_LABEL,
  WORK_ITEM_TITLE,
  workItemStatusTone,
} from '@/lib/finance/work-item-display';
import { cancelTaskAction, claimTaskAction, completeTaskAction } from './actions';
import styles from './workbench.module.css';

export interface TaskRow {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly subStatus: string;
  readonly titleKey: string;
  readonly availableActions: readonly WorkItemAction[];
  /** Deep link to the source entity (sourceType-aware: voucher / payment / …). */
  readonly href: string;
  /** Enriched source summary (单号 / 摘要 / 金额 / 日期), or null when unresolved. */
  readonly ref: WorkItemSourceRef | null;
}

type WorkflowKey = 'voucher' | 'intake' | 'cashier' | 'contract' | 'close' | 'other';
type WorkflowFilterKey = 'all' | WorkflowKey;

const WORKFLOW_ORDER: readonly WorkflowKey[] = [
  'voucher',
  'intake',
  'cashier',
  'contract',
  'close',
  'other',
];

const WORKFLOW_META: Record<WorkflowKey, { readonly label: string; readonly className: string }> = {
  voucher: { label: '凭证', className: styles.workflowDotVoucher },
  intake: { label: '票据', className: styles.workflowDotIntake },
  cashier: { label: '出纳', className: styles.workflowDotCashier },
  contract: { label: '合同', className: styles.workflowDotContract },
  close: { label: '结账', className: styles.workflowDotClose },
  other: { label: '其他', className: styles.workflowDotOther },
};

/**
 * 我的工作台 task table (T-009). Actions render strictly from each item's
 * backend-computed `availableActions`; the frontend never infers permission.
 * Mutations are version-guarded server actions — a 403/409 surfaces as a refresh.
 */
export function WorkbenchTasks({ rows }: { readonly rows: readonly TaskRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowFilterKey>('all');

  function act(row: TaskRow, action: WorkItemAction): void {
    // No blocking confirm: the button label is the intent, actions are recoverable
    // (complete → 红冲; cancel → re-submit), and the toast + optimistic version give feedback.
    setBusyId(row.id);
    start(async () => {
      const run =
        action === 'claim'
          ? claimTaskAction(row.id, row.version)
          : action === 'complete'
            ? completeTaskAction(row.id, row.version)
            : cancelTaskAction(row.id, row.version);
      const res = await run;
      setBusyId(null);
      if (res.ok) {
        toast.notify(
          'success',
          action === 'complete' ? '已过账' : `已${WORK_ITEM_ACTION_LABEL[action]}`,
          action === 'complete' && res.postedNo ? res.postedNo : (row.ref?.no ?? ''),
        );
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify(
          'info',
          '演示模式',
          '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可操作任务）',
        );
      } else if (res.reason === 'conflict') {
        toast.notify('info', '任务已变化', '该任务已被处理或版本过期，正在刷新…');
        router.refresh();
      } else {
        toast.notify('error', '操作失败', res.message);
      }
    });
  }

  if (rows.length === 0) {
    return <p className="wb-muted">该视图暂无任务。</p>;
  }

  const workflowCounts = countWorkflows(rows);
  const visibleWorkflows = WORKFLOW_ORDER.filter((key) => (workflowCounts.get(key) ?? 0) > 0);
  const activeWorkflow =
    workflow === 'all' || (workflowCounts.get(workflow) ?? 0) > 0 ? workflow : 'all';
  const filteredRows =
    activeWorkflow === 'all' ? rows : rows.filter((row) => workflowOf(row) === activeWorkflow);

  return (
    <>
      <WorkflowSelector
        active={activeWorkflow}
        counts={workflowCounts}
        workflows={visibleWorkflows}
        total={rows.length}
        onChange={setWorkflow}
      />
      <div className={styles.queueList}>
        <div className="wb-list wb-list--framed">
          {filteredRows.map((row) => {
            const busy = pending && busyId === row.id;
            return (
              <EntityRow
                key={row.id}
                model={{
                  ...taskToRow(row),
                  trailing: (
                    <TaskActions row={row} busy={busy} onAction={(action) => act(row, action)} />
                  ),
                }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function taskToRow(row: TaskRow): RowModel {
  const ref = row.ref;
  const workflow = workflowOf(row);
  const workflowMeta = WORKFLOW_META[workflow];
  return {
    leading: (
      <span className={`${styles.workflowDot} ${workflowMeta.className}`} aria-hidden="true" />
    ),
    title: WORK_ITEM_TITLE[row.titleKey] ?? row.titleKey,
    ...(ref ? { sub: ref.no } : {}),
    note: ref?.summary ?? '查看来源',
    meta: [
      { text: workflowMeta.label },
      { text: WORK_ITEM_SUBSTATUS_LABEL[row.subStatus] ?? row.subStatus },
      ...(ref ? [{ text: ref.date }] : []),
    ],
    metrics: ref ? [{ label: '金额', value: formatMoney(ref.amount) }] : [],
    status: {
      tone: workItemStatusTone(row.status),
      label: WORK_ITEM_STATUS_LABEL[row.status] ?? row.status,
    },
  };
}

function WorkflowSelector({
  active,
  counts,
  workflows,
  total,
  onChange,
}: {
  readonly active: WorkflowFilterKey;
  readonly counts: ReadonlyMap<WorkflowKey, number>;
  readonly workflows: readonly WorkflowKey[];
  readonly total: number;
  readonly onChange: (key: WorkflowFilterKey) => void;
}) {
  if (workflows.length <= 1) {
    const only = workflows[0] ?? 'other';
    const meta = WORKFLOW_META[only];
    return (
      <div className={styles.workflowSingle}>
        <span className={`${styles.workflowDot} ${meta.className}`} aria-hidden="true" />
        <span>{meta.label}</span>
        <span>{total}</span>
      </div>
    );
  }

  return (
    <div className="wb-segmented" role="tablist" aria-label="待办工作流">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'all'}
        className={`wb-segmented__item${active === 'all' ? ' wb-segmented__item--active' : ''}`}
        onClick={() => onChange('all')}
      >
        全部 <span>{total}</span>
      </button>
      {workflows.map((key) => {
        const meta = WORKFLOW_META[key];
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`wb-segmented__item${selected ? ' wb-segmented__item--active' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className={`${styles.workflowDot} ${meta.className}`} aria-hidden="true" />
            {meta.label} <span>{counts.get(key) ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

function countWorkflows(rows: readonly TaskRow[]): ReadonlyMap<WorkflowKey, number> {
  const counts = new Map<WorkflowKey, number>();
  for (const row of rows) {
    const workflow = workflowOf(row);
    counts.set(workflow, (counts.get(workflow) ?? 0) + 1);
  }
  return counts;
}

function workflowOf(row: TaskRow): WorkflowKey {
  if (row.titleKey.includes('.voucher.') || row.href.includes('/finance/vouchers'))
    return 'voucher';
  if (row.titleKey.includes('.intake.') || row.href.includes('/finance/intakes')) return 'intake';
  if (row.titleKey.includes('.payment.') || row.href.includes('/finance/payments'))
    return 'cashier';
  if (row.titleKey.includes('.contract.') || row.href.includes('/finance/contracts'))
    return 'contract';
  if (row.titleKey.includes('.period.') || row.titleKey.includes('.close.')) return 'close';
  return 'other';
}

function TaskActions({
  row,
  busy,
  onAction,
}: {
  readonly row: TaskRow;
  readonly busy: boolean;
  readonly onAction: (action: WorkItemAction) => void;
}) {
  return (
    <div className={styles.actions}>
      {row.availableActions.length === 0 && (
        <Link className="mt-btn mt-btn--ghost mt-btn--sm" href={row.href}>
          查看
        </Link>
      )}
      {row.availableActions.includes('claim') && (
        <button
          type="button"
          className="mt-btn mt-btn--secondary mt-btn--sm"
          disabled={busy}
          onClick={() => onAction('claim')}
        >
          领取
        </button>
      )}
      {row.availableActions.includes('complete') && (
        <button
          type="button"
          className="mt-btn mt-btn--primary mt-btn--sm"
          disabled={busy}
          onClick={() => onAction('complete')}
        >
          {busy ? '处理中…' : '通过并过账'}
        </button>
      )}
      {row.availableActions.includes('cancel') && (
        <button
          type="button"
          className="mt-btn mt-btn--ghost mt-btn--sm"
          disabled={busy}
          onClick={() => onAction('cancel')}
        >
          取消
        </button>
      )}
    </div>
  );
}
