import Link from 'next/link';
import { EntityRow, Section, Stat, StatStrip } from '@my-erp/ui';
import { ApiError, type WorkItem, type WorkItemView } from '@my-erp/api-client';
import { listPayments, listVouchers, listWorkItems } from '@/lib/finance/data-source';
import { WORK_ITEM_VIEW_TABS } from '@/lib/finance/work-item-display';
import { resolveWorkItemRef, workItemDeepLink } from '@/lib/finance/work-item-source';
import { VOUCHER_STATUS_LABELS, type VoucherVM } from '@/lib/finance/types';
import { WorkbenchTasks, type TaskRow } from './finance/workbench/workbench-tasks';
import tabStyles from './finance/workbench/workbench.module.css';

/**
 * 看板 — the single landing surface (方案 A): the personal workbench is the home.
 * Primary content is the role's task queue from the WorkItem kernel (待我处理 /
 * 监督 / 我处理过); a compact 本期概览 (KPI + 账簿/纠错) sits below. There is no
 * separate 我的工作台 entry — this page IS it, so the queue and the dashboard no
 * longer overlap. Each workflow keeps its own process-scoped queue elsewhere.
 */
export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const VIEW_KEYS = new Set<WorkItemView>(WORK_ITEM_VIEW_TABS.map((t) => t.key));

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
    href: workItemDeepLink(it.sourceType, it.sourceId),
    ref: resolveWorkItemRef(it, voucherById, paymentById),
  }));
}

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = first(sp.view) as WorkItemView | undefined;
  const view: WorkItemView = raw && VIEW_KEYS.has(raw) ? raw : 'my_tasks';

  let items: readonly WorkItem[] = [];
  let forbidden = false;
  try {
    items = await listWorkItems(view);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) forbidden = true;
    else throw err;
  }

  const [vouchers, payments] = await Promise.all([listVouchers(), listPayments()]);
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const rows = toRows(items, voucherById, paymentById);

  const draft = vouchers.filter((v) => v.status === 'draft');
  const pending = vouchers.filter((v) => v.status === 'pending');
  const posted = vouchers.filter((v) => v.status === 'posted');
  const reversed = vouchers.filter((v) => v.status === 'reversed');

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Section title="待办任务">
        <div className={tabStyles.tabs}>
          {WORK_ITEM_VIEW_TABS.map((t) => (
            <Link
              key={t.key}
              className={`${tabStyles.tab} ${view === t.key ? tabStyles.tabActive : ''}`}
              href={t.key === 'my_tasks' ? '/' : `/?view=${t.key}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {forbidden ? (
          <p className="wb-muted">监督视图仅对主管 / 管理员开放。</p>
        ) : (
          <WorkbenchTasks rows={rows} />
        )}
      </Section>

      <Section title="本期概览">
        <StatStrip>
          <Stat label="待处理" value={draft.length + pending.length} />
          <Stat label="待补全" value={draft.length} />
          <Stat label="待审核" value={pending.length} />
          <Stat label="本期已过账" value={posted.length} />
        </StatStrip>

        <div className="wb-list wb-list--framed">
          <EntityRow
            model={{
              href: '/finance/ledger',
              title: '账簿查询',
              note: '查看本期已过账凭证形成的账簿与余额。',
              metrics: [{ label: '已过账', value: posted.length }],
              status: { tone: 'success', label: VOUCHER_STATUS_LABELS.posted },
            }}
          />
          <EntityRow
            model={{
              title: '纠错留痕',
              note: '纠错只通过作废或红冲保留痕迹，不提供物理删除入口。',
              metrics: [{ label: '已红冲', value: reversed.length }],
              status: {
                tone: reversed.length > 0 ? 'danger' : 'muted',
                label: VOUCHER_STATUS_LABELS.reversed,
              },
            }}
          />
        </div>
      </Section>
    </div>
  );
}
