'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge, useToast, type CardTone } from '@my-erp/ui';
import type { WorkItemAction } from '@my-erp/api-client';
import { formatMoney } from '@/lib/finance/format';
import { cancelTaskAction, claimTaskAction, completeTaskAction } from './actions';
import styles from './workbench.module.css';

export interface TaskRow {
  readonly id: string;
  readonly version: number;
  readonly workItemType: string;
  readonly status: string;
  readonly subStatus: string;
  readonly priority: string;
  readonly assigneeUserId: string | null;
  readonly titleKey: string;
  readonly sourceId: string;
  readonly availableActions: readonly WorkItemAction[];
  readonly voucher: {
    readonly no: string;
    readonly summary: string;
    readonly totalDebit: string;
    readonly date: string;
    readonly status: string;
  } | null;
}

const TITLE: Record<string, string> = {
  'finance.voucher.review': '凭证复核',
  'finance.voucher.confirm': '凭证补全 / 确认',
};
const STATUS: Record<string, string> = {
  open: '待处理',
  claimed: '处理中',
  waiting: '等待中',
  returned: '已退回',
  completed: '已完成',
  canceled: '已取消',
};
const SUBSTATUS: Record<string, string> = {
  pending_review: '待复核',
  pending_confirmation: '待确认',
  pending_completion: '待补全',
  pending_correction: '待更正',
  pending_external: '待外部',
  pending_system: '待系统',
  blocked: '阻塞',
  ready: '就绪',
  done: '已完成',
};
const ACTION_LABEL: Record<WorkItemAction, string> = {
  claim: '领取',
  complete: '通过并过账',
  cancel: '取消',
  return: '退回',
  assign: '指派',
};
const statusTone = (s: string): CardTone =>
  s === 'completed' ? 'success' : s === 'canceled' ? 'muted' : s === 'returned' ? 'warning' : 'info';

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
          ACTION_LABEL[action] === '通过并过账' ? '已过账' : `已${ACTION_LABEL[action]}`,
          res.ok && 'postedNo' in res && res.postedNo ? res.postedNo : (row.voucher?.no ?? ''),
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
            <th className="wb-table__th">任务 / 凭证</th>
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
                  <div className={styles.taskTitle}>{TITLE[row.titleKey] ?? row.titleKey}</div>
                  <Link className={styles.voucherLink} href={`/finance/vouchers/${row.sourceId}`}>
                    {row.voucher ? (
                      <>
                        <span className="wb-mono">{row.voucher.no}</span> · {row.voucher.summary}
                      </>
                    ) : (
                      <span className="wb-muted">查看来源凭证</span>
                    )}
                  </Link>
                </td>
                <td>
                  <div className="wb-row wb-row--wrap">
                    <StatusBadge tone={statusTone(row.status)} dot label={STATUS[row.status] ?? row.status} />
                    <span className="wb-muted">{SUBSTATUS[row.subStatus] ?? row.subStatus}</span>
                  </div>
                </td>
                <td className="wb-table__cell--end wb-mono">
                  {row.voucher ? formatMoney(row.voucher.totalDebit) : ''}
                </td>
                <td className="wb-muted">{row.voucher?.date ?? ''}</td>
                <td className="wb-table__cell--end">
                  <div className={styles.actions}>
                    {row.availableActions.length === 0 && (
                      <Link className="mt-btn mt-btn--ghost mt-btn--sm" href={`/finance/vouchers/${row.sourceId}`}>
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
