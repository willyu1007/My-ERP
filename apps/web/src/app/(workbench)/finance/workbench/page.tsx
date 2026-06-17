import Link from 'next/link';
import { ApiError, type WorkItem, type WorkItemView } from '@my-erp/api-client';
import { EmptyState } from '@my-erp/ui';
import { listVouchers, listWorkItems } from '@/lib/finance/data-source';
import { WorkbenchTasks, type TaskRow } from './workbench-tasks';
import styles from './workbench.module.css';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const TABS: readonly { readonly key: WorkItemView; readonly label: string }[] = [
  { key: 'my_tasks', label: '待我处理' },
  { key: 'supervision', label: '监督' },
  { key: 'handled_by_me', label: '我处理过' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

/**
 * 我的工作台 (T-003 R2-UI) — the first real consumer of the WorkItem task kernel.
 * Personal task queue (待我处理), supervisor oversight (监督), and history (我处理过);
 * actions (领取 / 通过并过账 / 取消) are rendered strictly from each item's
 * backend-computed `availableActions`. Rows are enriched with the source voucher.
 */
export default async function WorkbenchPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = first(sp.view) as WorkItemView | undefined;
  const view: WorkItemView = raw && TAB_KEYS.has(raw) ? raw : 'my_tasks';

  let items: readonly WorkItem[] = [];
  let forbidden = false;
  try {
    items = await listWorkItems(view);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) forbidden = true;
    else throw err;
  }

  const vouchers = await listVouchers();
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const rows: TaskRow[] = items.map((it) => {
    const v = voucherById.get(it.sourceId);
    return {
      id: it.id,
      version: it.version,
      workItemType: it.workItemType,
      status: it.status,
      subStatus: it.subStatus,
      priority: it.priority,
      assigneeUserId: it.assigneeUserId,
      titleKey: it.titleKey,
      sourceId: it.sourceId,
      availableActions: it.availableActions,
      voucher: v
        ? { no: v.no, summary: v.summary, totalDebit: v.totalDebit, date: v.date, status: v.status }
        : null,
    };
  });

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">我的工作台</h1>
        <p className="wb-muted">按角色与权限派发的待办任务；操作直接走凭证状态机，保留 SoD 与审计。</p>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="工作台视图">
        {TABS.map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={view === t.key}
            className={`${styles.tab} ${view === t.key ? styles.tabActive : ''}`}
            href={`/finance/workbench?view=${t.key}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {forbidden ? (
        <EmptyState title="无权访问" desc="监督视图仅对主管 / 管理员开放。" />
      ) : (
        <WorkbenchTasks rows={rows} />
      )}
    </div>
  );
}
