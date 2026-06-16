'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Section, Stat, StatStrip, StatusBadge, useToast } from '@my-erp/ui';
import type { PeriodClose, PeriodCloseReadiness } from '@my-erp/api-client';
import { formatPeriod } from '@/lib/finance/format';
import { closePeriodAction, reopenPeriodAction } from './actions';
import styles from './period-close.module.css';

const fmtDateTime = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 19).replace('T', ' ') : '—';

/**
 * 期末结账 / 反结账 panel (T-006 M3a UI). Pick a period, see its close-readiness
 * (未过账 / 前期未结账 / 未打标现金流), then 结账 (结转损益 + lock) or 反结账 (红冲 + reopen).
 */
export function PeriodCloseClient({
  period,
  readiness,
  periods,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
  readonly periods: readonly PeriodClose[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState(period);

  function pick(next: string): void {
    setSel(next);
    if (next) router.push(`/finance/period-close?period=${next}`);
  }

  function runClose(): void {
    if (!window.confirm(`确认对 ${formatPeriod(period)} 结账？将结转损益并锁定该期间。`)) return;
    start(async () => {
      const res = await closePeriodAction(period);
      if (res.ok) {
        toast.notify('success', '已结账', `${formatPeriod(period)} · 净利润 ${res.netProfit ?? '—'}`);
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可真实结账）');
      } else {
        toast.notify('error', '结账失败', res.message);
      }
    });
  }

  function runReopen(target: string): void {
    if (!window.confirm(`确认反结账 ${formatPeriod(target)}？将红冲结转凭证并重新开放该期间。`)) return;
    start(async () => {
      const res = await reopenPeriodAction(target);
      if (res.ok) {
        toast.notify('success', '已反结账', formatPeriod(target));
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可真实反结账）');
      } else {
        toast.notify('error', '反结账失败', res.message);
      }
    });
  }

  const closedNow = readiness?.status === 'closed';
  const blockers: string[] = [];
  if (readiness && !closedNow) {
    if (readiness.unpostedCount > 0) blockers.push(`${readiness.unpostedCount} 张凭证未过账`);
    if (readiness.unclosedPriorPeriods.length > 0)
      blockers.push(`前期未结账：${readiness.unclosedPriorPeriods.join('、')}`);
  }

  return (
    <div className="wb-stack wb-stack--lg">
      <Section title="结账操作">
        <div className={styles.bar}>
          <label className={styles.field}>
            <span className="wb-muted">会计期间</span>
            <input
              type="month"
              className={styles.input}
              value={sel}
              onChange={(e) => pick(e.target.value)}
            />
          </label>
          {readiness && (
            <StatusBadge
              tone={closedNow ? 'muted' : readiness.canClose ? 'success' : 'warning'}
              dot
              label={closedNow ? '已结账' : readiness.canClose ? '可结账' : '未就绪'}
            />
          )}
        </div>

        {readiness && (
          <StatStrip>
            <Stat label="状态" value={closedNow ? '已结账' : '未结账'} />
            <Stat label="未过账凭证" value={String(readiness.unpostedCount)} />
            <Stat label="前期未结账" value={String(readiness.unclosedPriorPeriods.length)} />
            <Stat
              label="未打标现金流"
              value={String(readiness.untaggedCashFlowCount)}
              foot={readiness.untaggedCashFlowCount > 0 ? '不阻断结账' : undefined}
            />
          </StatStrip>
        )}

        {blockers.length > 0 && (
          <p className="wb-muted">结账条件未满足：{blockers.join('；')}。</p>
        )}
        {readiness && !closedNow && readiness.untaggedCashFlowCount > 0 && (
          <p className="wb-muted">
            提示：有 {readiness.untaggedCashFlowCount} 笔现金流水未打标，建议先在凭证中补充现金流量项目，否则现金流量表勾稽可能不平。
          </p>
        )}

        <div className="wb-row wb-row--wrap">
          {!closedNow ? (
            <button
              type="button"
              className="mt-btn mt-btn--primary"
              disabled={pending || !readiness?.canClose}
              onClick={runClose}
            >
              {pending ? '处理中…' : `结账 ${formatPeriod(period)}`}
            </button>
          ) : (
            <button
              type="button"
              className="mt-btn mt-btn--secondary"
              disabled={pending}
              onClick={() => runReopen(period)}
            >
              {pending ? '处理中…' : `反结账 ${formatPeriod(period)}`}
            </button>
          )}
        </div>
      </Section>

      <Section title="结账记录">
        {periods.length === 0 ? (
          <p className="wb-muted">尚无结账记录。</p>
        ) : (
          <div className="wb-table-wrap">
            <table className="wb-table">
              <thead>
                <tr>
                  <th className="wb-table__th">会计期间</th>
                  <th className="wb-table__th">状态</th>
                  <th className="wb-table__th">结账时间</th>
                  <th className="wb-table__th">反结账时间</th>
                  <th className="wb-table__th wb-table__cell--end">操作</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period} className="wb-table__row">
                    <td className="wb-mono">{p.period}</td>
                    <td>
                      <StatusBadge
                        tone={p.status === 'closed' ? 'success' : 'muted'}
                        dot
                        label={p.status === 'closed' ? '已结账' : '已开放'}
                      />
                    </td>
                    <td className="wb-muted">{fmtDateTime(p.closedAt)}</td>
                    <td className="wb-muted">{fmtDateTime(p.reopenedAt)}</td>
                    <td className="wb-table__cell--end">
                      {p.status === 'closed' && (
                        <button
                          type="button"
                          className="mt-btn mt-btn--ghost mt-btn--sm"
                          disabled={pending}
                          onClick={() => runReopen(p.period)}
                        >
                          反结账
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
