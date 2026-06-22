import Link from 'next/link';
import { Section } from '@my-erp/ui';
import { ApiError, type WorkItem, type WorkItemView } from '@my-erp/api-client';
import { listPayments, listVouchers, listWorkItems } from '@/lib/finance/data-source';
import { WORK_ITEM_VIEW_TABS } from '@/lib/finance/work-item-display';
import { resolveWorkItemRef, workItemDeepLink } from '@/lib/finance/work-item-source';
import { WorkbenchTasks, type TaskRow } from './workbench-tasks';
import styles from './workbench.module.css';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const VIEW_KEYS = new Set<WorkItemView>(WORK_ITEM_VIEW_TABS.map((t) => t.key));

/**
 * 我的工作台 (T-009, restoring T-003 R2-UI) — the web consumer of the WorkItem task
 * kernel. Personal queue (待我处理), supervisor oversight (监督), and history
 * (我处理过); actions render strictly from each item's backend `availableActions`.
 * Rows are enriched with the source voucher/payment for a safe summary + deep link.
 */
export default async function WorkbenchPage({
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

  // Enrich + deep-link by sourceType (voucher tasks ↔ payment tasks share the kernel).
  const [vouchers, payments] = await Promise.all([listVouchers(), listPayments()]);
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const rows: TaskRow[] = items.map((it) => ({
    id: it.id,
    version: it.version,
    status: it.status,
    subStatus: it.subStatus,
    titleKey: it.titleKey,
    availableActions: it.availableActions ?? [],
    href: workItemDeepLink(it.sourceType, it.sourceId),
    ref: resolveWorkItemRef(it, voucherById, paymentById),
  }));

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">我的工作台</h1>
        <p className="wb-muted">
          按角色与权限派发的待办任务；操作直接走凭证状态机，保留职责分离与审计留痕。
        </p>
      </div>

      <Section title="任务队列">
        <div className={styles.tabs}>
          {WORK_ITEM_VIEW_TABS.map((t) => (
            <Link
              key={t.key}
              className={`${styles.tab} ${view === t.key ? styles.tabActive : ''}`}
              href={`/finance/workbench?view=${t.key}`}
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
    </div>
  );
}
