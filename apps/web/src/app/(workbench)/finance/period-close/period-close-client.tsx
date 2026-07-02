'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { Stat, StatStrip, StatusBadge } from '@my-erp/ui/primitives';
import type { PeriodClose, PeriodCloseReadiness } from '@my-erp/api-client';
import { formatPeriod } from '@/lib/finance/format';
import { closePeriodAction, reopenPeriodAction } from './actions';
import styles from './period-close.module.css';

type CheckTone = 'success' | 'warning' | 'muted' | 'info';

interface CheckItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: CheckTone;
}

interface PeriodQueueItem {
  readonly period: string;
  readonly title: string;
  readonly meta: string;
  readonly tone: CheckTone;
  readonly statusLabel: string;
  readonly countLabel: string;
}

export type PeriodWorkflowKey = 'checks' | 'cash-flow' | 'close';

interface PeriodActionCard {
  readonly key: string;
  readonly title: string;
  readonly metric: string;
  readonly detail: string;
  readonly tone: CheckTone;
  readonly statusLabel: string;
  readonly href: string;
  readonly actionLabel: string;
}

interface WorkflowMeta {
  readonly title: string;
  readonly meta: string;
}

const fmtDateTime = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 19).replace('T', ' ') : '—';

function readinessLabel(readiness: PeriodCloseReadiness | null): {
  readonly tone: CheckTone;
  readonly label: string;
} {
  if (!readiness) return { tone: 'info', label: '待同步' };
  if (readiness.status === 'closed') return { tone: 'muted', label: '已关账' };
  if (readiness.canClose) return { tone: 'success', label: '可关账' };
  return { tone: 'warning', label: '未就绪' };
}

function buildChecks(readiness: PeriodCloseReadiness | null): readonly CheckItem[] {
  if (!readiness) {
    return [
      {
        key: 'sync',
        label: '关账状态',
        value: '待同步',
        detail: '暂无可用检查结果。',
        tone: 'info',
      },
    ];
  }

  const closed = readiness.status === 'closed';
  return [
    {
      key: 'period',
      label: '期间状态',
      value: closed ? '已锁定' : '开放中',
      detail: closed
        ? '本期间已完成关账，日常改动应通过反关账流程处理。'
        : '本期间仍可处理凭证和关账前事项。',
      tone: closed ? 'success' : 'muted',
    },
    {
      key: 'posting',
      label: '未过账凭证',
      value: `${readiness.unpostedCount}`,
      detail:
        readiness.unpostedCount > 0
          ? '还有凭证停留在草稿或审核队列，需先完成过账。'
          : '本期凭证已完成过账检查。',
      tone: readiness.unpostedCount > 0 ? 'warning' : 'success',
    },
    {
      key: 'prior',
      label: '前期关账',
      value: `${readiness.unclosedPriorPeriods.length}`,
      detail:
        readiness.unclosedPriorPeriods.length > 0
          ? `这些期间仍未关账：${readiness.unclosedPriorPeriods.join('、')}。`
          : '未发现前期未关账期间。',
      tone: readiness.unclosedPriorPeriods.length > 0 ? 'warning' : 'success',
    },
    {
      key: 'cash-flow',
      label: '现金流量打标',
      value: `${readiness.untaggedCashFlowCount}`,
      detail:
        readiness.untaggedCashFlowCount > 0
          ? '不阻断关账，但会影响现金流量表勾稽，建议本页补齐。'
          : '现金流量打标检查已通过。',
      tone: readiness.untaggedCashFlowCount > 0 ? 'warning' : 'success',
    },
    {
      key: 'closing',
      label: '损益结转准备',
      value: closed ? '已完成' : readiness.canClose ? '可执行' : '等待处理',
      detail: closed
        ? '关账记录已写入，期间已锁定。'
        : readiness.canClose
          ? '可生成结转损益凭证并锁定期间。'
          : '处理阻断项后再执行关账。',
      tone: closed ? 'success' : readiness.canClose ? 'success' : 'muted',
    },
  ];
}

function issueCount(readiness: PeriodCloseReadiness | null): number {
  if (!readiness || readiness.status === 'closed') return 0;
  return (
    readiness.unpostedCount +
    readiness.unclosedPriorPeriods.length +
    readiness.untaggedCashFlowCount
  );
}

function issueMeta(readiness: PeriodCloseReadiness | null): string {
  if (!readiness) return '等待检查';
  if (readiness.status === 'closed') return '期间已锁定';

  const parts = [
    readiness.unpostedCount > 0 ? `未过账 ${readiness.unpostedCount}` : null,
    readiness.unclosedPriorPeriods.length > 0
      ? `前期 ${readiness.unclosedPriorPeriods.length}`
      : null,
    readiness.untaggedCashFlowCount > 0 ? `现金流量 ${readiness.untaggedCashFlowCount}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '检查已通过';
}

function workflowMeta(kind: PeriodWorkflowKey, closed: boolean): WorkflowMeta {
  if (kind === 'cash-flow') return { title: '现金流量打标', meta: '月末补充事项' };
  if (kind === 'close') {
    return closed
      ? { title: '反关账', meta: '高风险纠错操作' }
      : { title: '执行关账', meta: '结转损益并锁定期间' };
  }
  return { title: '结账检查', meta: '阻断项与建议项' };
}

function buildActionCards(
  period: string,
  readiness: PeriodCloseReadiness | null,
): readonly PeriodActionCard[] {
  const closed = readiness?.status === 'closed';
  const status = readinessLabel(readiness);
  const unposted = readiness?.unpostedCount ?? 0;
  const prior = readiness?.unclosedPriorPeriods.length ?? 0;
  const cashFlow = readiness?.untaggedCashFlowCount ?? 0;

  return [
    {
      key: 'period',
      title: '期间状态',
      metric: readiness ? (closed ? '已锁定' : '开放中') : '待同步',
      detail: `${formatPeriod(period)} · ${closed ? '后续改动需先反关账' : '可处理凭证和月末事项'}`,
      tone: status.tone,
      statusLabel: status.label,
      href: `/finance/period-close/${period}/checks`,
      actionLabel: '查看检查',
    },
    {
      key: 'checks',
      title: '结账检查',
      metric: issueMeta(readiness),
      detail:
        unposted + prior > 0
          ? `阻断项 ${unposted + prior} · 需处理后才能关账`
          : '阻断项已通过，可继续处理月末事项。',
      tone: unposted + prior > 0 ? 'warning' : readiness ? 'success' : 'info',
      statusLabel: unposted + prior > 0 ? '阻塞' : readiness ? '通过' : '待检查',
      href: `/finance/period-close/${period}/checks`,
      actionLabel: '进入检查',
    },
    {
      key: 'cash-flow',
      title: '现金流量打标',
      metric: cashFlow > 0 ? `${cashFlow} 项待补` : '已完成',
      detail:
        cashFlow > 0 ? '不阻断关账，但会影响现金流量表勾稽。' : '本期现金流量打标检查已通过。',
      tone: cashFlow > 0 ? 'warning' : readiness ? 'success' : 'info',
      statusLabel: cashFlow > 0 ? '建议处理' : readiness ? '通过' : '待检查',
      href: `/finance/period-close/${period}/cash-flow`,
      actionLabel: '处理打标',
    },
    {
      key: 'close',
      title: closed ? '反关账' : '执行关账',
      metric: closed ? '已锁定' : readiness?.canClose ? '可执行' : '等待处理',
      detail: closed
        ? '仅用于纠错，会红冲结转凭证并重新开放期间。'
        : readiness?.canClose
          ? '生成结转损益凭证、写入关账记录并锁定期间。'
          : '处理阻断项后再执行关账。',
      tone: closed ? 'muted' : readiness?.canClose ? 'success' : 'muted',
      statusLabel: closed ? '高风险' : readiness?.canClose ? '可执行' : '等待检查',
      href: `/finance/period-close/${period}/close`,
      actionLabel: closed ? '进入反关账' : '进入关账',
    },
  ];
}

function periodQueue(
  period: string,
  readiness: PeriodCloseReadiness | null,
  periods: readonly PeriodClose[],
): readonly PeriodQueueItem[] {
  const currentStatus = readinessLabel(readiness);
  const currentIssues = issueCount(readiness);
  const items = new Map<string, PeriodQueueItem>();

  items.set(period, {
    period,
    title: formatPeriod(period),
    meta: issueMeta(readiness),
    tone: currentStatus.tone,
    statusLabel: currentStatus.label,
    countLabel:
      readiness?.status === 'closed'
        ? '已锁定'
        : currentIssues > 0
          ? `${currentIssues} 项`
          : readiness?.canClose
            ? '可执行'
            : '待检查',
  });

  for (const item of periods) {
    if (item.period === period) continue;
    const closed = item.status === 'closed';
    items.set(item.period, {
      period: item.period,
      title: formatPeriod(item.period),
      meta: closed ? `关账 ${fmtDateTime(item.closedAt)}` : `开放 ${fmtDateTime(item.reopenedAt)}`,
      tone: closed ? 'success' : 'muted',
      statusLabel: closed ? '已关账' : '已开放',
      countLabel: closed ? '已锁定' : '待检查',
    });
  }

  for (const prior of readiness?.unclosedPriorPeriods ?? []) {
    if (items.has(prior)) continue;
    items.set(prior, {
      period: prior,
      title: formatPeriod(prior),
      meta: '前置期间未关账',
      tone: 'warning',
      statusLabel: '待补齐',
      countLabel: '阻塞',
    });
  }

  return [...items.values()].sort((a, b) => b.period.localeCompare(a.period));
}

function CheckRow({ item }: { readonly item: CheckItem }) {
  return (
    <div className={styles.checkRow}>
      <div className={styles.checkMain}>
        <StatusBadge tone={item.tone} dot label={item.value} />
        <div>
          <div className={styles.checkTitle}>{item.label}</div>
          <div className={styles.checkDetail}>{item.detail}</div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ item }: { readonly item: PeriodActionCard }) {
  return (
    <Link className={styles.actionCard} href={item.href}>
      <div className={styles.actionCardHead}>
        <h3 className={styles.actionCardTitle}>{item.title}</h3>
        <StatusBadge tone={item.tone} dot label={item.statusLabel} />
      </div>
      <div className={styles.actionCardMetric}>{item.metric}</div>
      <div className={styles.actionCardDetail}>{item.detail}</div>
      <div className={styles.actionCardAction}>{item.actionLabel}</div>
    </Link>
  );
}

function PeriodRow({ item }: { readonly item: PeriodQueueItem }) {
  return (
    <Link className={styles.periodRow} href={`/finance/period-close/${item.period}`}>
      <div className={styles.periodRowMain}>
        <div className={styles.periodRowTitle}>{item.title}</div>
        <div className={styles.periodRowMeta}>{item.meta}</div>
      </div>
      <div className={styles.periodRowAside}>
        <StatusBadge tone={item.tone} dot label={item.statusLabel} />
        <span className={styles.periodRowCount}>{item.countLabel}</span>
      </div>
    </Link>
  );
}

function WorkflowStep({
  index,
  title,
  status,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly status?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.workflowStep} aria-labelledby={`period-step-${index}`}>
      <div className={styles.stepMarker} aria-hidden="true">
        {index}
      </div>
      <div className={styles.stepContent}>
        <div className={styles.stepHead}>
          <h3 id={`period-step-${index}`} className={styles.stepTitle}>
            {title}
          </h3>
          {status ? <div className={styles.stepStatus}>{status}</div> : null}
        </div>
        <div className={styles.stepBody}>{children}</div>
      </div>
    </section>
  );
}

function CloseEffect({ children }: { readonly children: ReactNode }) {
  return <li className={styles.effectItem}>{children}</li>;
}

function PeriodPickerButton({
  period,
  onChange,
}: {
  readonly period: string;
  readonly onChange: (period: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openPicker(): void {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  }

  return (
    <span className="mt-date-button-control">
      <button
        type="button"
        className={`mt-date-button ${styles.periodButton}`}
        aria-label={`会计期间 ${formatPeriod(period)}`}
        onClick={openPicker}
      >
        {formatPeriod(period)}
      </button>
      <input
        ref={inputRef}
        className="mt-date-button-native"
        aria-hidden="true"
        tabIndex={-1}
        type="month"
        value={period}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

function PeriodSummary({ readiness }: { readonly readiness: PeriodCloseReadiness | null }) {
  return (
    <div className={styles.summaryStats}>
      <StatStrip compact>
        <Stat label="未过账凭证" value={readiness ? String(readiness.unpostedCount) : '—'} />
        <Stat
          label="前期未关账"
          value={readiness ? String(readiness.unclosedPriorPeriods.length) : '—'}
        />
        <Stat
          label="现金流"
          value={readiness ? String(readiness.untaggedCashFlowCount) : '—'}
          foot={readiness && readiness.untaggedCashFlowCount > 0 ? '建议处理' : undefined}
        />
      </StatStrip>
    </div>
  );
}

export function PeriodCloseList({
  period,
  readiness,
  periods,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
  readonly periods: readonly PeriodClose[];
}) {
  const queueItems = periodQueue(period, readiness, periods);

  return (
    <div className={`wb-scene ${styles.scene}`}>
      <section className={styles.periodBoard} aria-label="会计期间">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>会计期间</h2>
          <span className={styles.panelCount}>{queueItems.length}</span>
        </div>
        <div className={styles.periodGrid}>
          {queueItems.map((item) => (
            <PeriodRow key={item.period} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function PeriodCloseOverview({
  period,
  readiness,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(period);
  const status = readinessLabel(readiness);
  const cards = buildActionCards(period, readiness);

  function pick(next: string): void {
    setSel(next);
    if (next) router.push(`/finance/period-close/${next}`);
  }

  return (
    <div className={`wb-scene ${styles.scene}`}>
      <section className={styles.overviewPage} aria-label={`${formatPeriod(period)} 关账概览`}>
        <div className={styles.overviewHeader}>
          <div>
            <h2 className={styles.workflowTitle}>{formatPeriod(period)}</h2>
            <div className={styles.workflowMeta}>关账概览</div>
          </div>
          <div className={styles.overviewHeaderActions}>
            <StatusBadge tone={status.tone} dot label={status.label} />
            <Link className="wb-action" href="/finance/period-close">
              返回期间
            </Link>
            <div className={styles.periodControl}>
              <span className={styles.periodLabel}>会计期间</span>
              <PeriodPickerButton period={sel} onChange={pick} />
            </div>
          </div>
        </div>

        <div className={styles.actionCardGrid}>
          {cards.map((item) => (
            <ActionCard key={item.key} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function PeriodCloseWorkflow({
  period,
  readiness,
  workflow,
  cashFlowWorklist,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
  readonly workflow: PeriodWorkflowKey;
  readonly cashFlowWorklist?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState(period);
  const status = readinessLabel(readiness);
  const closedNow = readiness?.status === 'closed';
  const checks = buildChecks(readiness);
  const currentWorkflow = workflowMeta(workflow, closedNow);

  function pick(next: string): void {
    setSel(next);
    if (next) router.push(`/finance/period-close/${next}/${workflow}`);
  }

  function runClose(): void {
    if (!window.confirm(`确认对 ${formatPeriod(period)} 关账？将结转损益并锁定该期间。`)) return;
    start(async () => {
      const res = await closePeriodAction(period);
      if (res.ok) {
        toast.notify(
          'success',
          '已关账',
          `${formatPeriod(period)} · 净利润 ${res.netProfit ?? '—'}`,
        );
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '暂不可执行', '当前环境未开放关账操作');
      } else {
        toast.notify('error', '关账失败', res.message);
      }
    });
  }

  function runReopen(target: string): void {
    if (!window.confirm(`确认反关账 ${formatPeriod(target)}？将红冲结转凭证并重新开放该期间。`))
      return;
    start(async () => {
      const res = await reopenPeriodAction(target);
      if (res.ok) {
        toast.notify('success', '已反关账', formatPeriod(target));
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '暂不可执行', '当前环境未开放反关账操作');
      } else {
        toast.notify('error', '反关账失败', res.message);
      }
    });
  }

  return (
    <div className={`wb-scene ${styles.scene}`}>
      <div className={styles.workflowPage}>
        <section
          className={styles.workflowCard}
          aria-label={`${formatPeriod(period)} ${currentWorkflow.title}`}
        >
          <div className={styles.workflowCardHeader}>
            <div>
              <h2 className={styles.workflowTitle}>{currentWorkflow.title}</h2>
              <div className={styles.workflowMeta}>
                {formatPeriod(period)} · {currentWorkflow.meta}
              </div>
            </div>
            <div className={styles.workflowCardHeaderActions}>
              <StatusBadge tone={status.tone} dot label={status.label} />
              <Link className="wb-action" href={`/finance/period-close/${period}`}>
                返回概览
              </Link>
              <div className={styles.periodControl}>
                <span className={styles.periodLabel}>会计期间</span>
                <PeriodPickerButton period={sel} onChange={pick} />
              </div>
            </div>
          </div>

          <div className={styles.workflowCardSummary}>
            <PeriodSummary readiness={readiness} />
          </div>

          <div className={styles.workflowSteps}>
            {workflow === 'checks' ? (
              <WorkflowStep index={1} title="检查结果">
                <div className={styles.checkList}>
                  {checks.map((item) => (
                    <CheckRow key={item.key} item={item} />
                  ))}
                </div>
                {readiness && readiness.unpostedCount > 0 ? (
                  <div className={styles.workflowFooter}>
                    <Link className="mt-btn mt-btn--secondary" href="/finance/daily-accounting">
                      去凭证处理
                    </Link>
                  </div>
                ) : null}
              </WorkflowStep>
            ) : null}

            {workflow === 'cash-flow' ? (
              <WorkflowStep
                index={1}
                title="现金流量项目"
                status={
                  readiness?.untaggedCashFlowCount ? (
                    <StatusBadge
                      tone="warning"
                      dot
                      label={`${readiness.untaggedCashFlowCount} 项`}
                    />
                  ) : (
                    <StatusBadge
                      tone={readiness ? 'success' : 'info'}
                      dot
                      label={readiness ? '通过' : '待检查'}
                    />
                  )
                }
              >
                {cashFlowWorklist ? (
                  <div className={styles.embeddedWorklist}>{cashFlowWorklist}</div>
                ) : (
                  <p className={styles.noExtraWork}>暂无现金流量补充事项。</p>
                )}
              </WorkflowStep>
            ) : null}

            {workflow === 'close' ? (
              <WorkflowStep
                index={1}
                title={closedNow ? '反关账' : '执行关账'}
                status={
                  !closedNow && !readiness?.canClose ? (
                    <StatusBadge tone="muted" dot label="等待检查" />
                  ) : undefined
                }
              >
                <div className={styles.execution}>
                  <div>
                    <div className={styles.executionTitle}>
                      {closedNow
                        ? `${formatPeriod(period)} 已锁定`
                        : `准备关账 ${formatPeriod(period)}`}
                    </div>
                    <ul className={styles.effectList}>
                      {!closedNow ? (
                        <>
                          <CloseEffect>生成结转损益凭证并写入关账记录。</CloseEffect>
                          <CloseEffect>锁定该会计期间，后续改动需先反关账。</CloseEffect>
                        </>
                      ) : (
                        <>
                          <CloseEffect>红冲原结转凭证，并重新开放该期间。</CloseEffect>
                          <CloseEffect>反关账属于高风险操作，应仅用于纠错。</CloseEffect>
                        </>
                      )}
                    </ul>
                  </div>
                  {!closedNow ? (
                    <button
                      type="button"
                      className="mt-btn mt-btn--primary"
                      disabled={pending || !readiness?.canClose}
                      onClick={runClose}
                    >
                      {pending ? '处理中…' : `执行关账`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mt-btn mt-btn--secondary"
                      disabled={pending}
                      onClick={() => runReopen(period)}
                    >
                      {pending ? '处理中…' : '反关账'}
                    </button>
                  )}
                </div>
              </WorkflowStep>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
