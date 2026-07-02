'use client';

import { useTransition, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { SetBreadcrumb } from '@my-erp/ui/shell';
import type { PeriodClose, PeriodCloseReadiness } from '@my-erp/api-client';
import { formatPeriod } from '@/lib/finance/format';
import { closePeriodAction, reopenPeriodAction } from './actions';
import {
  nextPeriodWorkflow,
  periodHardBlockerCount,
  type PeriodWorkflowKey,
} from './period-close-workflow';
import styles from './period-close.module.css';

type CheckTone = 'success' | 'warning' | 'muted' | 'info' | 'accent';

interface CheckItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: CheckTone;
}

interface PeriodTableRow {
  readonly period: string;
  readonly title: string;
  readonly statusTone: CheckTone;
  readonly statusLabel: string;
  readonly blockingLabel: string;
  readonly blockingTone: CheckTone;
  readonly currentStep: string;
  readonly recordLabel: string;
  readonly actionHref: string;
  readonly isCurrent: boolean;
}

interface WorkflowTab {
  readonly key: PeriodWorkflowKey;
  readonly title: string;
  readonly statusLabel: string;
  readonly tone: CheckTone;
  readonly href: string;
  readonly current: boolean;
}

const fmtDateTime = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 19).replace('T', ' ') : '-';

function readinessLabel(readiness: PeriodCloseReadiness | null): {
  readonly tone: CheckTone;
  readonly label: string;
} {
  if (!readiness) return { tone: 'info', label: '待同步' };
  if (readiness.status === 'closed') return { tone: 'muted', label: '已关账' };
  if (readiness.canClose) return { tone: 'success', label: '可关账' };
  return { tone: 'warning', label: '未就绪' };
}

function blockingLabel(readiness: PeriodCloseReadiness | null): {
  readonly tone: CheckTone;
  readonly label: string;
} {
  if (!readiness) return { tone: 'info', label: '待检查' };
  if (readiness.status === 'closed') return { tone: 'muted', label: '无' };

  const parts = [
    readiness.unpostedCount > 0 ? `未过账 ${readiness.unpostedCount}` : null,
    readiness.unclosedPriorPeriods.length > 0
      ? `前期 ${readiness.unclosedPriorPeriods.length}`
      : null,
  ].filter(Boolean);

  return parts.length > 0
    ? { tone: 'warning', label: parts.join(' / ') }
    : { tone: 'success', label: '无' };
}

function currentStepLabel(readiness: PeriodCloseReadiness | null): string {
  const workflow = nextPeriodWorkflow(readiness);
  if (workflow === 'checks') return readiness ? '处理阻断项' : '同步检查';
  if (workflow === 'cash-flow') return '补现金流量';
  if (workflow === 'preview') return '预览结转';
  return readiness?.status === 'closed' ? '查看记录' : '执行关账';
}

function periodTableRows(
  period: string,
  readiness: PeriodCloseReadiness | null,
  periods: readonly PeriodClose[],
): readonly PeriodTableRow[] {
  const rows = new Map<string, PeriodTableRow>();
  const status = readinessLabel(readiness);
  const blocking = blockingLabel(readiness);
  const workflow = nextPeriodWorkflow(readiness);

  rows.set(period, {
    period,
    title: formatPeriod(period),
    statusTone: status.tone,
    statusLabel: status.label,
    blockingLabel: blocking.label,
    blockingTone: blocking.tone,
    currentStep: currentStepLabel(readiness),
    recordLabel: readiness?.status === 'closed' ? '已写入关账记录' : '-',
    actionHref: `/finance/period-close/${period}/${workflow}`,
    isCurrent: true,
  });

  for (const item of periods) {
    if (item.period === period) continue;
    const closed = item.status === 'closed';
    rows.set(item.period, {
      period: item.period,
      title: formatPeriod(item.period),
      statusTone: closed ? 'success' : 'muted',
      statusLabel: closed ? '已关账' : '已开放',
      blockingLabel: closed ? '无' : '待检查',
      blockingTone: closed ? 'muted' : 'info',
      currentStep: closed ? '查看记录' : '结账检查',
      recordLabel: closed
        ? `关账 ${fmtDateTime(item.closedAt)}`
        : `开放 ${fmtDateTime(item.reopenedAt)}`,
      actionHref: `/finance/period-close/${item.period}/${closed ? 'close' : 'checks'}`,
      isCurrent: false,
    });
  }

  for (const prior of readiness?.unclosedPriorPeriods ?? []) {
    if (rows.has(prior)) continue;
    rows.set(prior, {
      period: prior,
      title: formatPeriod(prior),
      statusTone: 'warning',
      statusLabel: '待补齐',
      blockingLabel: '前期未关账',
      blockingTone: 'warning',
      currentStep: '补齐关账',
      recordLabel: '-',
      actionHref: `/finance/period-close/${prior}/checks`,
      isCurrent: false,
    });
  }

  return [...rows.values()].sort((a, b) => b.period.localeCompare(a.period));
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
          ? '不阻断关账，但会影响现金流量表勾稽，建议补齐。'
          : '现金流量打标检查已通过。',
      tone: readiness.untaggedCashFlowCount > 0 ? 'warning' : 'success',
    },
  ];
}

function workflowTabs(
  period: string,
  readiness: PeriodCloseReadiness | null,
): readonly WorkflowTab[] {
  const hard = periodHardBlockerCount(readiness);
  const cashFlow = readiness?.untaggedCashFlowCount ?? 0;
  const closed = readiness?.status === 'closed';
  const current = nextPeriodWorkflow(readiness);

  const tabs: readonly Omit<WorkflowTab, 'statusLabel' | 'tone'>[] = [
    {
      key: 'checks',
      title: '检查',
      href: `/finance/period-close/${period}/checks`,
      current: current === 'checks',
    },
    {
      key: 'cash-flow',
      title: '现金流量',
      href: `/finance/period-close/${period}/cash-flow`,
      current: current === 'cash-flow',
    },
    {
      key: 'preview',
      title: '结转预览',
      href: `/finance/period-close/${period}/preview`,
      current: current === 'preview',
    },
    {
      key: 'close',
      title: closed ? '关账记录' : '关账',
      href: `/finance/period-close/${period}/close`,
      current: current === 'close',
    },
  ];

  return tabs.map((tab) => {
    if (tab.current) return { ...tab, statusLabel: '当前', tone: 'accent' };
    if (tab.key === 'checks') {
      return {
        ...tab,
        statusLabel: !readiness ? '待同步' : hard > 0 ? `阻塞 ${hard}` : '通过',
        tone: !readiness ? 'info' : hard > 0 ? 'warning' : 'success',
      };
    }
    if (tab.key === 'cash-flow') {
      return {
        ...tab,
        statusLabel: !readiness ? '待检查' : cashFlow > 0 ? `建议 ${cashFlow}` : '完成',
        tone: !readiness ? 'info' : cashFlow > 0 ? 'warning' : 'success',
      };
    }
    if (tab.key === 'preview') {
      return {
        ...tab,
        statusLabel: closed ? '已生成' : !readiness ? '待同步' : hard > 0 ? '等待检查' : '可查看',
        tone: closed ? 'success' : !readiness ? 'info' : hard > 0 ? 'muted' : 'success',
      };
    }
    return {
      ...tab,
      statusLabel: closed ? '已关账' : readiness?.canClose ? '可执行' : '等待',
      tone: closed ? 'muted' : readiness?.canClose ? 'success' : 'muted',
    };
  });
}

function CheckRow({ item }: { readonly item: CheckItem }) {
  return (
    <div className={styles.checkRow}>
      <div className={styles.checkMain}>
        <StatusCell tone={item.tone} label={item.value} />
        <div>
          <div className={styles.checkTitle}>{item.label}</div>
          <div className={styles.checkDetail}>{item.detail}</div>
        </div>
      </div>
    </div>
  );
}

const statusToneClass: Record<CheckTone, string> = {
  success: styles.statusTextSuccess,
  warning: styles.statusTextWarning,
  muted: styles.statusTextMuted,
  info: styles.statusTextInfo,
  accent: styles.statusTextAccent,
};

function StatusCell({ tone, label }: { readonly tone: CheckTone; readonly label: string }) {
  return <span className={`${styles.statusText} ${statusToneClass[tone]}`}>{label}</span>;
}

function CloseEffect({ children }: { readonly children: ReactNode }) {
  return <li className={styles.effectItem}>{children}</li>;
}

function SummaryMetric({
  label,
  value,
  tone = 'muted',
  foot,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: CheckTone;
  readonly foot?: string;
}) {
  return (
    <div className={styles.summaryMetric}>
      <div className={styles.summaryMetricLabel}>{label}</div>
      <div className={`${styles.summaryMetricValue} ${statusToneClass[tone]}`}>{value}</div>
      {foot ? <div className={styles.summaryMetricFoot}>{foot}</div> : null}
    </div>
  );
}

function WorkSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.workSection}>
      <h4 className={styles.workSectionTitle}>{title}</h4>
      {children}
    </section>
  );
}

function ActionBar({ children }: { readonly children: ReactNode }) {
  return <div className={styles.actionBar}>{children}</div>;
}

function ChecksPanel({
  period,
  readiness,
  onRefresh,
  onConfirm,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
  readonly onRefresh: () => void;
  readonly onConfirm: () => void;
}) {
  const checks = buildChecks(readiness);
  const hard = periodHardBlockerCount(readiness);
  const firstPrior = readiness?.unclosedPriorPeriods[0];

  return (
    <div className={styles.panelBody}>
      <WorkSection title="状态摘要">
        <div className={styles.summaryGrid}>
          <SummaryMetric
            label="未过账凭证"
            value={readiness ? String(readiness.unpostedCount) : '-'}
            tone={
              readiness && readiness.unpostedCount > 0 ? 'warning' : readiness ? 'success' : 'info'
            }
          />
          <SummaryMetric
            label="前期未关账"
            value={readiness ? String(readiness.unclosedPriorPeriods.length) : '-'}
            tone={
              readiness && readiness.unclosedPriorPeriods.length > 0
                ? 'warning'
                : readiness
                  ? 'success'
                  : 'info'
            }
          />
          <SummaryMetric
            label="检查结论"
            value={!readiness ? '待同步' : hard > 0 ? '需处理' : '通过'}
            tone={!readiness ? 'info' : hard > 0 ? 'warning' : 'success'}
            foot={hard > 0 ? '阻断关账' : undefined}
          />
        </div>
      </WorkSection>

      <WorkSection title="检查内容">
        <div className={styles.checkList}>
          {checks.map((item) => (
            <CheckRow key={item.key} item={item} />
          ))}
        </div>
        {readiness && readiness.unclosedPriorPeriods.length > 0 ? (
          <div className={styles.inlineNotice}>
            <div className={styles.inlineNoticeTitle}>需要先补齐前期关账</div>
            <div className={styles.inlineNoticeText}>
              {readiness.unclosedPriorPeriods.map((p) => formatPeriod(p)).join('、')} 未完成关账。
            </div>
          </div>
        ) : null}
      </WorkSection>

      <ActionBar>
        <button type="button" className="mt-btn mt-btn--secondary" onClick={onRefresh}>
          刷新检查
        </button>
        <button type="button" className="mt-btn mt-btn--primary" onClick={onConfirm}>
          确认检查
        </button>
        {readiness && readiness.unpostedCount > 0 ? (
          <Link className="mt-btn mt-btn--secondary" href="/finance/daily-accounting">
            去凭证处理
          </Link>
        ) : null}
        {firstPrior ? (
          <Link
            className="mt-btn mt-btn--secondary"
            href={`/finance/period-close/${firstPrior}/checks`}
          >
            处理前期
          </Link>
        ) : null}
        {readiness && hard === 0 ? (
          <Link className="mt-btn mt-btn--primary" href={`/finance/period-close/${period}/preview`}>
            继续到结转预览
          </Link>
        ) : null}
      </ActionBar>
    </div>
  );
}

function PreviewPanel({
  period,
  readiness,
  onConfirm,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
  readonly onConfirm: () => void;
}) {
  const hard = periodHardBlockerCount(readiness);
  const closed = readiness?.status === 'closed';
  const waitingForReadiness = !readiness;

  return (
    <div className={styles.panelBody}>
      <WorkSection title="状态摘要">
        <div className={styles.summaryGrid}>
          <SummaryMetric
            label="预览状态"
            value={
              waitingForReadiness ? '待同步' : hard > 0 ? '等待检查' : closed ? '已生成' : '可查看'
            }
            tone={waitingForReadiness ? 'info' : hard > 0 ? 'muted' : 'success'}
          />
          <SummaryMetric
            label="现金流量建议"
            value={readiness ? String(readiness.untaggedCashFlowCount) : '-'}
            tone={
              readiness && readiness.untaggedCashFlowCount > 0
                ? 'warning'
                : readiness
                  ? 'success'
                  : 'info'
            }
            foot={readiness && readiness.untaggedCashFlowCount > 0 ? '不阻断关账' : undefined}
          />
          <SummaryMetric
            label="关账准备"
            value={readiness?.canClose ? '可执行' : '等待'}
            tone={readiness?.canClose ? 'success' : 'muted'}
          />
        </div>
      </WorkSection>

      <WorkSection title="结转影响">
        <ul className={styles.effectList}>
          {waitingForReadiness ? (
            <>
              <CloseEffect>当前环境暂无可用检查结果。</CloseEffect>
              <CloseEffect>同步完成后再查看结转影响并执行关账。</CloseEffect>
            </>
          ) : hard > 0 ? (
            <>
              <CloseEffect>存在阻断项，需先完成结账检查。</CloseEffect>
              <CloseEffect>阻断项清零后，才能执行关账并生成结转凭证。</CloseEffect>
            </>
          ) : (
            <>
              <CloseEffect>执行关账时生成结转损益凭证。</CloseEffect>
              <CloseEffect>损益类科目余额结转至本年利润。</CloseEffect>
              <CloseEffect>关账后锁定该会计期间，后续改动需先反关账。</CloseEffect>
            </>
          )}
          {readiness && readiness.untaggedCashFlowCount > 0 ? (
            <CloseEffect>
              现金流量仍有 {readiness.untaggedCashFlowCount}{' '}
              项建议补齐；不阻断关账，但会影响现金流量表勾稽。
            </CloseEffect>
          ) : null}
        </ul>
      </WorkSection>

      <ActionBar>
        <button
          type="button"
          className="mt-btn mt-btn--primary"
          disabled={waitingForReadiness || hard > 0}
          onClick={onConfirm}
        >
          确认结转预览
        </button>
        {waitingForReadiness || hard > 0 ? (
          <Link
            className="mt-btn mt-btn--secondary"
            href={`/finance/period-close/${period}/checks`}
          >
            返回检查
          </Link>
        ) : null}
        {!waitingForReadiness && hard === 0 ? (
          <Link className="mt-btn mt-btn--secondary" href={`/finance/period-close/${period}/close`}>
            前往关账
          </Link>
        ) : null}
      </ActionBar>
    </div>
  );
}

function ClosePanel({
  period,
  readiness,
  pending,
  onClose,
  onReopen,
}: {
  readonly period: string;
  readonly readiness: PeriodCloseReadiness | null;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onReopen: (period: string) => void;
}) {
  const closedNow = readiness?.status === 'closed';
  const hard = periodHardBlockerCount(readiness);

  return (
    <div className={styles.panelBody}>
      <WorkSection title="状态摘要">
        <div className={styles.summaryGrid}>
          <SummaryMetric
            label="期间状态"
            value={closedNow ? '已锁定' : readiness ? '开放中' : '待同步'}
            tone={closedNow ? 'muted' : readiness ? 'success' : 'info'}
          />
          <SummaryMetric
            label="阻断项"
            value={readiness ? String(hard) : '-'}
            tone={hard > 0 ? 'warning' : readiness ? 'success' : 'info'}
          />
          <SummaryMetric
            label="执行状态"
            value={closedNow ? '可反关账' : readiness?.canClose ? '可关账' : '等待'}
            tone={closedNow ? 'warning' : readiness?.canClose ? 'success' : 'muted'}
          />
        </div>
      </WorkSection>

      <WorkSection title={closedNow ? '反关账影响' : '关账影响'}>
        <ul className={styles.effectList}>
          {!closedNow ? (
            <>
              <CloseEffect>生成结转损益凭证并写入关账记录。</CloseEffect>
              <CloseEffect>锁定该会计期间，后续改动需先反关账。</CloseEffect>
              <CloseEffect>关账、反关账都会写入审计记录。</CloseEffect>
            </>
          ) : (
            <>
              <CloseEffect>红冲原结转凭证，并重新开放该期间。</CloseEffect>
              <CloseEffect>反关账属于高风险操作，应仅用于纠错。</CloseEffect>
              <CloseEffect>如果后续期间已关账，需要先从后往前反关账。</CloseEffect>
            </>
          )}
        </ul>
      </WorkSection>

      <ActionBar>
        {!closedNow && !readiness?.canClose ? (
          <Link
            className="mt-btn mt-btn--secondary"
            href={`/finance/period-close/${period}/checks`}
          >
            返回检查
          </Link>
        ) : null}
        {!closedNow ? (
          <button
            type="button"
            className="mt-btn mt-btn--primary"
            disabled={pending || !readiness?.canClose}
            onClick={onClose}
          >
            {pending ? '处理中...' : '执行关账'}
          </button>
        ) : (
          <button
            type="button"
            className="mt-btn mt-btn--secondary"
            disabled={pending}
            onClick={() => onReopen(period)}
          >
            {pending ? '处理中...' : '反关账'}
          </button>
        )}
      </ActionBar>
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
  const rows = periodTableRows(period, readiness, periods);
  const router = useRouter();

  function openRow(href: string): void {
    router.push(href);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, href: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openRow(href);
  }

  return (
    <div className={`wb-scene ${styles.scene}`}>
      <section className={styles.periodBoard} aria-label="会计期间">
        <div className="wb-table-wrap">
          <table className={`wb-table ${styles.periodTable}`}>
            <colgroup>
              <col className={styles.periodColumn} />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className="wb-table__th">会计期间</th>
                <th className="wb-table__th">关账状态</th>
                <th className="wb-table__th">阻断项</th>
                <th className="wb-table__th">当前步骤</th>
                <th className="wb-table__th">关账记录</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.period}
                  className={`wb-table__row ${styles.periodRow}`}
                  role="link"
                  tabIndex={0}
                  aria-label={`进入 ${row.title} 期末结账`}
                  onClick={() => openRow(row.actionHref)}
                  onKeyDown={(event) => handleRowKeyDown(event, row.actionHref)}
                >
                  <td>
                    <div className={styles.periodCell}>
                      <span className={styles.periodCellLink}>{row.title}</span>
                      {row.isCurrent ? <span className={styles.currentPill}>当前期间</span> : null}
                    </div>
                  </td>
                  <td>
                    <StatusCell tone={row.statusTone} label={row.statusLabel} />
                  </td>
                  <td>
                    <StatusCell tone={row.blockingTone} label={row.blockingLabel} />
                  </td>
                  <td>{row.currentStep}</td>
                  <td className={styles.recordCell}>{row.recordLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const tabs = workflowTabs(period, readiness);

  function runClose(): void {
    if (!window.confirm(`确认对 ${formatPeriod(period)} 关账？将结转损益并锁定该期间。`)) return;
    start(async () => {
      const res = await closePeriodAction(period);
      if (res.ok) {
        toast.notify(
          'success',
          '已关账',
          `${formatPeriod(period)} · 净利润 ${res.netProfit ?? '-'}`,
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

  function confirmStep(title: string, message: string): void {
    toast.notify('success', title, message);
  }

  function confirmChecks(): void {
    if (!readiness) {
      router.refresh();
      toast.notify('info', '正在同步检查', '已重新拉取检查结果');
      return;
    }
    if (periodHardBlockerCount(readiness) > 0) {
      toast.notify('info', '检查未通过', '需先处理阻断项后再确认');
      return;
    }
    confirmStep('已确认检查', `${formatPeriod(period)} 检查项已通过确认`);
  }

  return (
    <div className={`wb-scene ${styles.scene}`}>
      <SetBreadcrumb items={[{ label: formatPeriod(period) }]} />
      <section className={styles.workflowPage} aria-label={`${formatPeriod(period)} 期末结账`}>
        <div className={styles.detailHeader}>
          <div className={styles.detailTitleRow}>
            <h2 className={styles.workflowTitle}>{formatPeriod(period)}</h2>
            <Link className="wb-action" href="/finance/period-close">
              返回期间列表
            </Link>
          </div>
        </div>

        <nav className={styles.workflowTabs} aria-label="结账步骤">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              className={`${styles.workflowTab} ${
                tab.key === workflow ? styles.workflowTabActive : ''
              }`}
              href={tab.href}
              aria-current={tab.key === workflow ? 'page' : undefined}
            >
              <span className={styles.workflowTabTitle}>{tab.title}</span>
              <StatusCell tone={tab.tone} label={tab.statusLabel} />
            </Link>
          ))}
        </nav>

        <section className={styles.workPanel} aria-label={`${formatPeriod(period)} 当前结账步骤`}>
          {workflow === 'checks' ? (
            <ChecksPanel
              period={period}
              readiness={readiness}
              onRefresh={() => router.refresh()}
              onConfirm={confirmChecks}
            />
          ) : null}

          {workflow === 'cash-flow' ? (
            <div className={styles.panelBody}>
              <WorkSection title="状态摘要">
                <div className={styles.summaryGrid}>
                  <SummaryMetric
                    label="待打标"
                    value={readiness ? String(readiness.untaggedCashFlowCount) : '-'}
                    tone={
                      readiness && readiness.untaggedCashFlowCount > 0
                        ? 'warning'
                        : readiness
                          ? 'success'
                          : 'info'
                    }
                    foot={
                      readiness && readiness.untaggedCashFlowCount > 0 ? '不阻断关账' : undefined
                    }
                  />
                  <SummaryMetric
                    label="报表影响"
                    value={readiness && readiness.untaggedCashFlowCount > 0 ? '影响勾稽' : '无待补'}
                    tone={
                      readiness && readiness.untaggedCashFlowCount > 0
                        ? 'warning'
                        : readiness
                          ? 'success'
                          : 'info'
                    }
                  />
                  <SummaryMetric
                    label="下一步"
                    value="结转预览"
                    tone={readiness ? 'success' : 'muted'}
                  />
                </div>
              </WorkSection>

              <WorkSection title="处理内容">
                {cashFlowWorklist ? (
                  <div className={styles.embeddedWorklist}>{cashFlowWorklist}</div>
                ) : (
                  <p className={styles.noExtraWork}>暂无现金流量补充事项。</p>
                )}
              </WorkSection>

              <ActionBar>
                <button
                  type="button"
                  className="mt-btn mt-btn--secondary"
                  onClick={() => router.refresh()}
                >
                  刷新打标状态
                </button>
                <button
                  type="button"
                  className="mt-btn mt-btn--primary"
                  disabled={!readiness}
                  onClick={() =>
                    confirmStep('已确认现金流量', `${formatPeriod(period)} 现金流量事项已确认`)
                  }
                >
                  确认现金流量
                </button>
                <Link
                  className="mt-btn mt-btn--secondary"
                  href={`/finance/period-close/${period}/preview`}
                >
                  继续到结转预览
                </Link>
              </ActionBar>
            </div>
          ) : null}

          {workflow === 'preview' ? (
            <PreviewPanel
              period={period}
              readiness={readiness}
              onConfirm={() =>
                confirmStep('已确认结转预览', `${formatPeriod(period)} 结转影响已确认`)
              }
            />
          ) : null}

          {workflow === 'close' ? (
            <ClosePanel
              period={period}
              readiness={readiness}
              pending={pending}
              onClose={runClose}
              onReopen={runReopen}
            />
          ) : null}
        </section>
      </section>
    </div>
  );
}
