'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Section, StatusBadge } from '@my-erp/ui/primitives';
import { useToast } from '@my-erp/ui/feedback';
import type { CardTone } from '@my-erp/ui/contracts';
import type { FundConsumption } from '@my-erp/api-client';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { consumeFundAction } from './fund-actions';

/**
 * 货币资金结算 · 出纳执行 (T-012 Phase 4, D4). Inline on a posted voucher's detail:
 * one card per cash/bank line where the cashier records that money actually moved
 * (bank-flow reference, attachment, reconciliation) or marks it 无需执行. Consuming
 * NEVER posts a second voucher — the action reports 已确认执行, not 已过账.
 */
const DIRECTION_LABEL: Record<string, string> = { inflow: '资金流入', outflow: '资金流出' };

const EXECUTION_LABEL: Record<string, string> = {
  pending: '待执行',
  executed: '已执行',
  skipped: '无需执行',
  void: '已作废',
};

const EXECUTION_TONE: Record<string, CardTone> = {
  pending: 'warning',
  executed: 'success',
  skipped: 'muted',
  void: 'muted',
};

export function FundConsumptionPanel({ rows }: { readonly rows: readonly FundConsumption[] }) {
  if (rows.length === 0) return null;
  return (
    <Section title="货币资金结算 · 出纳执行">
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
  const [reconciled, setReconciled] = useState(row.reconciliationStatus === 'reconciled');

  const isPending = row.executionStatus === 'pending';

  function run(executionStatus: 'executed' | 'skipped'): void {
    start(async () => {
      const res = await consumeFundAction(row.id, {
        expectedVersion: row.version,
        executionStatus,
        bankFlowRef: bankFlowRef.trim() || null,
        attachmentId: attachmentId.trim() || null,
        reconciliationStatus: reconciled ? 'reconciled' : 'unreconciled',
      });
      if (res.ok) {
        toast.notify(
          'success',
          executionStatus === 'executed' ? '已确认执行' : '已标记无需',
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
          tone={EXECUTION_TONE[row.executionStatus] ?? 'muted'}
          dot
          label={EXECUTION_LABEL[row.executionStatus] ?? row.executionStatus}
        />
      </div>
      <div className="wb-row">
        <span className="wb-muted">{DIRECTION_LABEL[row.direction] ?? row.direction}</span>
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
          <label className="wb-row">
            <input
              type="checkbox"
              checked={reconciled}
              onChange={(e) => setReconciled(e.target.checked)}
            />
            <span>已与银行对账</span>
          </label>
          <div className="wb-row wb-row--wrap">
            <button
              type="button"
              className="mt-btn mt-btn--primary"
              disabled={pending}
              onClick={() => run('executed')}
            >
              {pending ? '处理中…' : '确认执行'}
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
          <div className="wb-row">
            <span className="wb-muted">对账</span>
            <span className="wb-spacer" />
            <span>{row.reconciliationStatus === 'reconciled' ? '已对账' : '未对账'}</span>
          </div>
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
