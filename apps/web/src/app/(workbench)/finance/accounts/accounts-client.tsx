'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { StandardChartDiff } from '@my-erp/api-client';
import type { TableColumn } from '@my-erp/ui/contracts';
import { useToast } from '@my-erp/ui/feedback';
import { EntityTable } from '@my-erp/ui/list';
import { Scene, Stat, StatStrip, StatusBadge } from '@my-erp/ui/primitives';
import {
  ACCOUNT_CATEGORY_LABELS,
  ACCOUNT_DIRECTION_LABELS,
  AUX_TYPE_LABELS,
} from '@/lib/finance/types';
import type { AccountCategory, AccountVM } from '@/lib/finance/types';
import { importStandardChartAction } from './actions';

/**
 * 会计科目体系 — 树视图。编码升序即树前序，名称按层级缩进标识父子关系。
 * 按类别分段筛选；末级/停用/辅助核算一目了然。读取走 data-source（W2 demo）。
 */
type CategoryKey = 'all' | AccountCategory;

const CATEGORIES: readonly { readonly key: CategoryKey; readonly label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'asset', label: ACCOUNT_CATEGORY_LABELS.asset },
  { key: 'liability', label: ACCOUNT_CATEGORY_LABELS.liability },
  { key: 'equity', label: ACCOUNT_CATEGORY_LABELS.equity },
  { key: 'cost', label: ACCOUNT_CATEGORY_LABELS.cost },
  { key: 'profitLoss', label: ACCOUNT_CATEGORY_LABELS.profitLoss },
];

function indentedName(a: AccountVM): string {
  return a.level > 1 ? `${'　'.repeat(a.level - 1)}└ ${a.name}` : a.name;
}

const COLUMNS: readonly TableColumn<AccountVM>[] = [
  // Not sortable: the table is tree-ordered by code; re-sorting would split children from parents.
  {
    key: 'code',
    label: '编码',
    width: '120px',
    render: (a) => <span className="wb-mono">{a.code}</span>,
  },
  {
    key: 'name',
    label: '名称',
    width: '1fr',
    render: (a) => <span className={a.active ? '' : 'wb-muted'}>{indentedName(a)}</span>,
  },
  {
    key: 'direction',
    label: '方向',
    align: 'center',
    render: (a) => ACCOUNT_DIRECTION_LABELS[a.direction],
  },
  { key: 'leaf', label: '级次', align: 'center', render: (a) => (a.isLeaf ? '末级' : '上级') },
  {
    key: 'aux',
    label: '辅助核算',
    render: (a) =>
      a.auxTypes.length > 0 ? a.auxTypes.map((t) => AUX_TYPE_LABELS[t]).join('、') : '—',
  },
  {
    key: 'status',
    label: '状态',
    align: 'end',
    render: (a) => (
      <StatusBadge tone={a.active ? 'success' : 'muted'} dot label={a.active ? '启用' : '停用'} />
    ),
  },
];

/** 标准科目 v2 的显式导入审查卡（T-012 D6）：预览增量与冲突，人工确认后导入。 */
function ChartImportCard({ diff }: { readonly diff: StandardChartDiff }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  if (diff.additions.length === 0 && diff.conflicts.length === 0) return null;

  function runImport(): void {
    start(async () => {
      const res = await importStandardChartAction();
      if (res.ok) {
        toast.notify(
          'success',
          '标准科目已导入',
          `新增 ${res.result.added} 个，转为上级 ${res.result.convertedParents} 个${
            res.result.conflicts.length > 0 ? `，跳过冲突 ${res.result.conflicts.length} 个` : ''
          }`,
        );
        router.refresh();
      } else {
        toast.notify('error', '导入失败', res.message);
      }
    });
  }

  return (
    <div className="mt-card wb-stack wb-stack--sm">
      <h3 className="wb-card__title">标准科目模板 v{diff.chartVersion} 可用更新</h3>
      <p className="wb-muted">
        可新增 {diff.additions.length} 个常用科目
        {diff.parentConversions.length > 0
          ? `；${diff.parentConversions.map((p) => `${p.code} ${p.name}`).join('、')} 将转为上级科目（无余额，安全）`
          : ''}
        {diff.conflicts.length > 0
          ? `；${diff.conflicts.length} 个科目因上级已有记账记录将被跳过，需手工处理`
          : ''}
        。导入为显式增量操作，不会修改或删除现有科目数据。
      </p>
      {expanded ? (
        <p className="wb-muted">
          {diff.additions.map((a) => `${a.code} ${a.name}`).join('、')}
        </p>
      ) : null}
      <div style={{ display: 'inline-flex', gap: 8 }}>
        <button
          type="button"
          className="mt-btn mt-btn--secondary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起清单' : '查看清单'}
        </button>
        <button
          type="button"
          className="mt-btn mt-btn--primary"
          disabled={pending}
          onClick={runImport}
        >
          {pending ? '导入中…' : '导入更新'}
        </button>
      </div>
    </div>
  );
}

export function AccountsClient({
  accounts,
  chartDiff = null,
}: {
  readonly accounts: readonly AccountVM[];
  readonly chartDiff?: StandardChartDiff | null;
}) {
  const [category, setCategory] = useState<CategoryKey>('all');

  const countOf = (k: CategoryKey): number =>
    k === 'all' ? accounts.length : accounts.filter((a) => a.category === k).length;
  // 已按编码=树序排好；类别筛选保持顺序。
  const rows = (category === 'all' ? accounts : accounts.filter((a) => a.category === category))
    .slice()
    .sort((x, y) => (x.code < y.code ? -1 : x.code > y.code ? 1 : 0));

  const nav = (
    <div className="wb-segmented" role="tablist" aria-label="科目类别">
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={category === c.key}
          className={`wb-segmented__item${category === c.key ? ' wb-segmented__item--active' : ''}`}
          onClick={() => setCategory(c.key)}
        >
          {c.label}
          <span className="wb-segmented__count">{countOf(c.key)}</span>
        </button>
      ))}
    </div>
  );

  const stats = (
    <StatStrip>
      <Stat label="科目总数" value={accounts.length} />
      <Stat label="末级科目" value={accounts.filter((a) => a.isLeaf).length} />
      <Stat label="停用" value={accounts.filter((a) => !a.active).length} />
    </StatStrip>
  );

  return (
    <Scene
      nav={nav}
      stats={stats}
      intro="《小企业会计准则》科目体系。编码升序即树前序，缩进表示层级。"
    >
      {chartDiff ? <ChartImportCard diff={chartDiff} /> : null}
      <EntityTable<AccountVM> model={{ columns: COLUMNS, rows, rowKey: (a) => a.code }} />
    </Scene>
  );
}
