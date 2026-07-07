'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Section, StatusBadge } from '@my-erp/ui/primitives';
import { useToast } from '@my-erp/ui/feedback';
import type { FundConsumption } from '@my-erp/api-client';
import { formatDate, formatMoney } from '@/lib/finance/format';
import {
  FUND_CONFIRM_LABEL,
  FUND_DIRECTION_LABEL,
  FUND_EXECUTION_LABEL,
  FUND_EXECUTION_TONE,
} from '@/lib/finance/fund-display';
import { consumeFundAction } from './fund-actions';

/**
 * 资金执行 (T-012 Phase 4, D4; copy/queue T-013). Inline on a posted voucher's detail:
 * one card per cash/bank line where the cashier records that money actually moved
 * (确认到账 / 确认已付, optional bank-flow ref) or marks it 无需执行. Consuming NEVER
 * posts a second voucher. This panel is the accountant/audit-side view; the cashier's
 * first-person queue lives on the 出纳收付 page (T-013).
 * 对账 was intentionally removed from the UI (no post-execution action backs it yet).
 */
export function FundConsumptionPanel({ rows }: { readonly rows: readonly FundConsumption[] }) {
  if (rows.length === 0) return null;
  return (
    <Section title="资金执行">
      <div className="wb-stack wb-stack--md">
        {rows.map((row) => (
          <FundRow key={row.id} row={row} />
        ))}
      </div>
    </Section>
  );
}

function FundRow({ row }: { readonly row: FundConsumption }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [bankFlowRef, setBankFlowRef] = useState(row.bankFlowRef ?? '');
  const [attachmentId, setAttachmentId] = useState(row.attachmentId ?? '');

  const isPending = row.executionStatus === 'pending';

  function run(executionStatus: 'executed' | 'skipped'): void {
    start(async () => {
      const res = await consumeFundAction(row.id, {
        expectedVersion: row.version,
        executionStatus,
        bankFlowRef: bankFlowRef.trim() || null,
        attachmentId: attachmentId.trim() || null,
      });
      if (res.ok) {
        toast.notify(
          'success',
          executionStatus === 'executed'
            ? (FUND_CONFIRM_LABEL[row.direction] ?? '已确认执行')
            : '已标记无需',
          `${row.voucherNo} 第 ${row.lineNo} 行`,
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
    <div className="mt-card wb-stack wb-stack--sm">
      <div className="wb-row">
        <span>
          <span className="wb-mono">{row.accountCode}</span> {row.accountName}
        </span>
        <span className="wb-spacer" />
        <StatusBadge
          tone={FUND_EXECUTION_TONE[row.executionStatus] ?? 'muted'}
          dot
          label={FUND_EXECUTION_LABEL[row.executionStatus] ?? row.executionStatus}
        />
      </div>
      <div className="wb-row">
        <span className="wb-muted">{FUND_DIRECTION_LABEL[row.direction] ?? row.direction}</span>
        <span className="wb-spacer" />
        <span className="wb-mono">{formatMoney(row.amount)}</span>
      </div>

      {isPending ? (
        <>
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
          <label className="mt-field">
            <span className="mt-label">附件编号（可选）</span>
            <input
              className="mt-input"
              value={attachmentId}
              autoComplete="off"
              placeholder="回单 / 凭据附件 ID"
              onChange={(e) => setAttachmentId(e.target.value)}
            />
          </label>
          <div className="wb-row wb-row--wrap">
            <button
              type="button"
              className="mt-btn mt-btn--primary"
              disabled={pending}
              onClick={() => run('executed')}
            >
              {pending ? '处理中…' : (FUND_CONFIRM_LABEL[row.direction] ?? '确认执行')}
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--ghost"
              disabled={pending}
              onClick={() => run('skipped')}
            >
              标记无需
            </button>
          </div>
        </>
      ) : (
        <div className="wb-stack wb-stack--sm">
          {row.bankFlowRef && (
            <div className="wb-row">
              <span className="wb-muted">流水号</span>
              <span className="wb-spacer" />
              <span>{row.bankFlowRef}</span>
            </div>
          )}
          {row.executedBy && (
            <div className="wb-row">
              <span className="wb-muted">经办</span>
              <span className="wb-spacer" />
              <span>
                {row.executedBy}
                {row.executedAt ? ` · ${formatDate(row.executedAt.slice(0, 10))}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
