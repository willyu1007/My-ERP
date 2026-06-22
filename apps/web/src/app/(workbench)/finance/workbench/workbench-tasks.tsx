'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge, useToast } from '@my-erp/ui';
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
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可操作任务）');
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

  return (
    <div className="wb-table-wrap">
      <table className="wb-table">
        <thead>
          <tr>
            <th className="wb-table__th">任务 / 来源</th>
            <th className="wb-table__th">状态</th>
            <th className="wb-table__th wb-table__cell--end">金额</th>
            <th className="wb-table__th">日期</th>
            <th className="wb-table__th wb-table__cell--end">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = pending && busyId === row.id;
            return (
              <tr key={row.id} className="wb-table__row">
                <td>
                  <div className={styles.taskTitle}>{WORK_ITEM_TITLE[row.titleKey] ?? row.titleKey}</div>
                  <Link className="wb-mono" href={row.href}>
                    {row.ref ? (
                      <>
                        {row.ref.no} · {row.ref.summary}
                      </>
                    ) : (
                      <span className="wb-muted">查看来源</span>
                    )}
                  </Link>
                </td>
                <td>
                  <div className="wb-row wb-row--wrap">
                    <StatusBadge
                      tone={workItemStatusTone(row.status)}
                      dot
                      label={WORK_ITEM_STATUS_LABEL[row.status] ?? row.status}
                    />
                    <span className="wb-muted">
                      {WORK_ITEM_SUBSTATUS_LABEL[row.subStatus] ?? row.subStatus}
                    </span>
                  </div>
                </td>
                <td className="wb-table__cell--end wb-mono">
                  {row.ref ? formatMoney(row.ref.amount) : ''}
                </td>
                <td className="wb-muted">{row.ref?.date ?? ''}</td>
                <td className="wb-table__cell--end">
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
                        onClick={() => act(row, 'claim')}
                      >
                        领取
                      </button>
                    )}
                    {row.availableActions.includes('complete') && (
                      <button
                        type="button"
                        className="mt-btn mt-btn--primary mt-btn--sm"
                        disabled={busy}
                        onClick={() => act(row, 'complete')}
                      >
                        {busy ? '处理中…' : '通过并过账'}
                      </button>
                    )}
                    {row.availableActions.includes('cancel') && (
                      <button
                        type="button"
                        className="mt-btn mt-btn--ghost mt-btn--sm"
                        disabled={busy}
                        onClick={() => act(row, 'cancel')}
                      >
                        取消
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
