'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { EntityRow } from '@my-erp/ui/list';
import type { FundConsumption } from '@my-erp/api-client';
import { formatDate, formatMoney } from '@/lib/finance/format';
import {
  FUND_CONFIRM_LABEL,
  FUND_DIRECTION_LABEL,
  FUND_EXECUTION_LABEL,
  FUND_EXECUTION_TONE,
  FUND_QUEUE_FETCH_LIMIT,
} from '@/lib/finance/fund-display';
import { consumeFundAction } from '../vouchers/[id]/fund-actions';

/**
 * 资金执行队列 (T-013) — the cashier's first-person answer to "这笔钱收/付了没有？".
 * One row per cash/bank line of a posted accountant/manual voucher (spawned by the
 * fund-consumption engine, T-012 Phase 4). Confirming records execution and closes
 * the paired task — never posting a voucher. Lives on the 出纳收付 page so the
 * cashier has a single home; the voucher-detail panel remains the audit-side view.
 */
type FundQueueKey = 'pending' | 'done' | 'all';

const FUND_QUEUES: readonly { readonly key: FundQueueKey; readonly label: string }[] = [
  { key: 'pending', label: '待执行' },
  { key: 'done', label: '已执行' },
  { key: 'all', label: '全部' },
];

function matchesQueue(row: FundConsumption, queue: FundQueueKey): boolean {
  switch (queue) {
    case 'all':
      return true;
    case 'pending':
      return row.executionStatus === 'pending';
    case 'done':
      return row.executionStatus === 'executed' || row.executionStatus === 'skipped';
  }
}

const EMPTY_COPY: Record<FundQueueKey, string> = {
  pending: '暂无待执行的资金任务。会计凭证过账后，涉及现金/银行的款项会出现在这里。',
  done: '还没有已执行的记录。',
  all: '暂无资金执行记录。',
};

export function FundExecutionQueue({ rows }: { readonly rows: readonly FundConsumption[] }) {
  const [queue, setQueue] = useState<FundQueueKey>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = rows.filter((row) => matchesQueue(row, queue));

  return (
    <section id="fund-queue" className="wb-stack wb-stack--md">
      <div className="wb-row wb-row--wrap">
        <h2 className="wb-card__title">资金执行</h2>
        <span className="wb-spacer" />
        <div className="wb-segmented" role="tablist" aria-label="资金执行队列">
          {FUND_QUEUES.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={queue === item.key}
              className={`wb-segmented__item${queue === item.key ? ' wb-segmented__item--active' : ''}`}
              onClick={() => setQueue(item.key)}
            >
              {item.label}
              <span className="wb-segmented__count">
                {rows.filter((row) => matchesQueue(row, item.key)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="wb-muted">{EMPTY_COPY[queue]}</p>
      ) : (
        <div className="wb-list wb-list--framed">
          {filtered.map((row) => (
            <FundQueueRow
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
            />
          ))}
        </div>
      )}
      {rows.length >= FUND_QUEUE_FETCH_LIMIT && (
        <p className="wb-muted">仅显示最近 {FUND_QUEUE_FETCH_LIMIT} 条记录。</p>
      )}
    </section>
  );
}

function FundQueueRow({
  row,
  expanded,
  onToggle,
}: {
  readonly row: FundConsumption;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [bankFlowRef, setBankFlowRef] = useState(row.bankFlowRef ?? '');
  const isPending = row.executionStatus === 'pending';
  const confirmLabel = FUND_CONFIRM_LABEL[row.direction] ?? '确认执行';

  function run(executionStatus: 'executed' | 'skipped'): void {
    start(async () => {
      const res = await consumeFundAction(row.id, {
        expectedVersion: row.version,
        executionStatus,
        bankFlowRef: bankFlowRef.trim() || null,
      });
      if (res.ok) {
        toast.notify(
          'success',
          executionStatus === 'executed' ? confirmLabel : '已标记无需',
          `${row.voucherNo} · ${formatMoney(row.amount)}`,
        );
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端');
      } else if (res.reason === 'conflict') {
        toast.notify('info', '任务已变化', '已被处理或版本过期，正在刷新…');
        router.refresh();
      } else {
        toast.notify('error', '操作失败', res.message);
      }
    });
  }

  return (
    <div className="wb-stack wb-stack--sm">
      <EntityRow
        model={{
          title: row.summary || row.counterparty || row.voucherNo,
          sub: row.voucherNo,
          note: `账户：${row.accountCode} ${row.accountName}`,
          meta: [
            { text: FUND_DIRECTION_LABEL[row.direction] ?? row.direction },
            { text: formatDate(row.createdAt.slice(0, 10)) },
          ],
          metrics: [{ label: '金额', value: formatMoney(row.amount) }],
          status: {
            tone: FUND_EXECUTION_TONE[row.executionStatus] ?? 'muted',
            label: FUND_EXECUTION_LABEL[row.executionStatus] ?? row.executionStatus,
          },
          trailing: isPending ? (
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              onClick={onToggle}
            >
              {expanded ? '收起' : '处理'}
            </button>
          ) : (
            <Link
              className="mt-btn mt-btn--ghost mt-btn--sm"
              href={`/finance/vouchers/${row.voucherId}`}
            >
              查看凭证
            </Link>
          ),
        }}
      />
      {isPending && expanded && (
        <div className="mt-card wb-stack wb-stack--sm">
          <label className="mt-field">
            <span className="mt-label">银行流水号 / 结算参考（可选）</span>
            <input
              className="mt-input"
              value={bankFlowRef}
              autoComplete="off"
              placeholder="如银行回单号"
              onChange={(e) => setBankFlowRef(e.target.value)}
            />
          </label>
          <div className="wb-row wb-row--wrap">
            <button
              type="button"
              className="mt-btn mt-btn--primary"
              disabled={pending}
              onClick={() => run('executed')}
            >
              {pending ? '处理中…' : confirmLabel}
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--ghost"
              disabled={pending}
              onClick={() => run('skipped')}
            >
              标记无需
            </button>
            <span className="wb-spacer" />
            <Link
              className="mt-btn mt-btn--ghost mt-btn--sm"
              href={`/finance/vouchers/${row.voucherId}`}
            >
              查看凭证
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
