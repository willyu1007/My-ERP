import Link from 'next/link';
import { Section, Stat, StatStrip } from '@my-erp/ui/primitives';
import { ApiError, type WorkItem } from '@my-erp/api-client';
import {
  getFundConsumptionPendingCount,
  listContracts,
  listIntakes,
  listPayments,
  listPeriods,
  listVouchers,
  listWorkItems,
} from '@/lib/finance/data-source';
import { formatMoney, formatPeriod } from '@/lib/finance/format';
import { centsToString, sumCents } from '@/lib/finance/money';
import { resolveWorkItemRef, workItemDeepLink } from '@/lib/finance/work-item-source';
import type { VoucherVM } from '@/lib/finance/types';
import { WorkbenchTasks, type TaskRow } from './finance/workbench/workbench-tasks';
import styles from './dashboard.module.css';

/**
 * 看板 — the single landing surface. It gives the user the current-period state,
 * a real workflow-classified task queue, and direct entry points to finance work.
 */
export const dynamic = 'force-dynamic';

function isFetchUnavailable(err: unknown): boolean {
  return err instanceof TypeError && err.message.includes('fetch failed');
}

async function readListOrEmpty<T>(read: () => Promise<readonly T[]>): Promise<readonly T[]> {
  try {
    return await read();
  } catch (err) {
    if (isFetchUnavailable(err)) return [];
    throw err;
  }
}

function toRows(
  items: readonly WorkItem[],
  voucherById: ReadonlyMap<string, VoucherVM>,
  paymentById: Parameters<typeof resolveWorkItemRef>[2],
): TaskRow[] {
  return items.map((it) => ({
    id: it.id,
    version: it.version,
    status: it.status,
    subStatus: it.subStatus,
    titleKey: it.titleKey,
    availableActions: it.availableActions ?? [],
    href: workItemDeepLink(it.sourceType, it.sourceId, it.workItemType),
    ref: resolveWorkItemRef(it, voucherById, paymentById),
  }));
}

export default async function DashboardPage() {
  let items: readonly WorkItem[] = [];
  let forbidden = false;
  try {
    items = await listWorkItems('my_tasks');
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) forbidden = true;
    else if (isFetchUnavailable(err)) items = [];
    else throw err;
  }

  const [vouchers, payments, intakes, contracts, periods, fundPending] = await Promise.all([
    readListOrEmpty(listVouchers),
    readListOrEmpty(listPayments),
    readListOrEmpty(listIntakes),
    readListOrEmpty(listContracts),
    readListOrEmpty(listPeriods),
    getFundConsumptionPendingCount().catch((err) => {
      if (isFetchUnavailable(err)) return 0;
      throw err;
    }),
  ]);
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const rows = toRows(items, voucherById, paymentById);

  const draft = vouchers.filter((v) => v.status === 'draft');
  const pending = vouchers.filter((v) => v.status === 'pending');
  const posted = vouchers.filter((v) => v.status === 'posted');
  const reversed = vouchers.filter((v) => v.status === 'reversed');
  const openTaskCount = items.filter(
    (item) => item.status !== 'completed' && item.status !== 'canceled',
  ).length;
  const postedTotal = centsToString(sumCents(posted.map((voucher) => voucher.totalDebit)));
  const currentPeriod =
    posted[0]?.period ??
    pending[0]?.period ??
    draft[0]?.period ??
    new Date().toISOString().slice(0, 7);
  const intakeOpen = intakes.filter(
    (intake) =>
      intake.status === 'received' ||
      intake.status === 'extracting' ||
      intake.status === 'extracted' ||
      intake.status === 'failed',
  ).length;
  const paymentOpen = payments.filter(
    (payment) =>
      payment.status === 'pending_accounting' ||
      payment.status === 'draft' ||
      payment.status === 'pending_approval' ||
      payment.status === 'approved',
  ).length;
  const contractOpen = contracts.filter((contract) => contract.status !== 'closed').length;
  const lastPeriod = periods[0];

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Section title="本期概览">
        <div className={styles.overviewPanel}>
          <div className={styles.overviewHead}>
            <span className={styles.overviewPeriod}>{formatPeriod(currentPeriod)}</span>
            <span className={styles.overviewState}>待结账</span>
          </div>
          <StatStrip>
            <Stat label="待处理" value={openTaskCount} />
            <Stat label="待补全" value={draft.length} />
            <Stat label="待审核" value={pending.length} />
            <Stat label="本期已过账" value={posted.length} />
            <Stat label="过账金额" value={formatMoney(postedTotal)} />
          </StatStrip>
        </div>
      </Section>

      <Section title="待办队列">
        <div className={styles.queueScope}>
          {forbidden ? (
            <p className="wb-muted">监督视图仅对主管 / 管理员开放。</p>
          ) : (
            <WorkbenchTasks rows={rows} />
          )}
        </div>
      </Section>

      <Section title="快捷入口">
        <div className={styles.commandGrid}>
          <CommandLink
            href="/finance/daily-accounting"
            tone="voucher"
            title="凭证处理"
            meta={`${draft.length} 草稿 · ${pending.length} 待审`}
          />
          <CommandLink
            href="/finance/intakes"
            tone="intake"
            title="票据录入"
            meta={`${intakeOpen} 待生成`}
          />
          <CommandLink
            href="/finance/payments"
            tone="cashier"
            title="出纳收付"
            meta={
              fundPending > 0
                ? `${paymentOpen} 待确认 · ${fundPending} 待执行`
                : `${paymentOpen} 待确认`
            }
          />
          <CommandLink
            href="/finance/contracts"
            tone="contract"
            title="合同台账"
            meta={`${contractOpen} 执行中`}
          />
          <CommandLink
            href="/finance/period-close"
            tone="close"
            title="期末结账"
            meta={lastPeriod?.period ?? '待检查'}
          />
          <CommandLink
            href="/finance/ledger"
            tone="ledger"
            title="账簿查询"
            meta={`${posted.length} 已过账`}
          />
          <CommandLink
            href="/finance/reports"
            tone="report"
            title="财务报表"
            meta={formatPeriod(currentPeriod)}
          />
          <CommandLink
            href="/finance/daily-accounting?status=reversed"
            tone="muted"
            title="纠错留痕"
            meta={`${reversed.length} 已红冲`}
          />
        </div>
      </Section>
    </div>
  );
}

function CommandLink({
  href,
  tone,
  title,
  meta,
}: {
  readonly href: string;
  readonly tone:
    | 'voucher'
    | 'intake'
    | 'cashier'
    | 'contract'
    | 'close'
    | 'ledger'
    | 'report'
    | 'muted';
  readonly title: string;
  readonly meta: string;
}) {
  return (
    <Link className={styles.commandItem} href={href}>
      <span className={`${styles.commandDot} ${styles[`commandDot_${tone}`]}`} aria-hidden="true" />
      <span className={styles.commandText}>
        <span className={styles.commandTitle}>{title}</span>
        <span className={styles.commandMeta}>{meta}</span>
      </span>
    </Link>
  );
}
