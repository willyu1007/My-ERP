'use client';

import { useState } from 'react';
import { Badge, EntityTable, Scene, Stat, StatStrip } from '@my-erp/ui';
import type { TableColumn } from '@my-erp/ui';
import {
  ACCOUNT_CATEGORY_LABELS,
  ACCOUNT_DIRECTION_LABELS,
  AUX_TYPE_LABELS,
} from '@/lib/finance/types';
import type { AccountCategory, AccountVM } from '@/lib/finance/types';

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
  { key: 'code', label: '编码', width: '120px', render: (a) => <span className="wb-mono">{a.code}</span> },
  { key: 'name', label: '名称', width: '1fr', render: (a) => <span className={a.active ? '' : 'wb-muted'}>{indentedName(a)}</span> },
  { key: 'direction', label: '方向', align: 'center', render: (a) => ACCOUNT_DIRECTION_LABELS[a.direction] },
  { key: 'leaf', label: '级次', align: 'center', render: (a) => (a.isLeaf ? '末级' : '上级') },
  { key: 'aux', label: '辅助核算', render: (a) => (a.auxTypes.length > 0 ? a.auxTypes.map((t) => AUX_TYPE_LABELS[t]).join('、') : '—') },
  { key: 'status', label: '状态', align: 'end', render: (a) => <Badge tone={a.active ? 'success' : 'muted'} dot>{a.active ? '启用' : '停用'}</Badge> },
];

export function AccountsClient({ accounts }: { readonly accounts: readonly AccountVM[] }) {
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
    <Scene nav={nav} stats={stats} intro="《小企业会计准则》科目体系（演示）。编码升序即树前序，缩进表示层级。">
      <EntityTable<AccountVM>
        model={{ columns: COLUMNS, rows, rowKey: (a) => a.code }}
      />
    </Scene>
  );
}
