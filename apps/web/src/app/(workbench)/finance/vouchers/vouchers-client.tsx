'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, EntityTable, ListView } from '@my-erp/ui';
import type { TableColumn } from '@my-erp/ui';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { VOUCHER_STATUS_LABELS, voucherStatusTone } from '@/lib/finance/types';
import type { VoucherStatus, VoucherVM } from '@/lib/finance/types';

/**
 * 凭证列表 — List 模板（ListView + EntityTable）。二级导航按会计工作流动作组织
 * （制单 / 审核 / 过账 / 红冲），每个分段对应一个状态队列。
 */
type Stage = 'all' | VoucherStatus;

const STAGES: readonly { readonly key: Stage; readonly label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '制单' },
  { key: 'pending', label: '审核' },
  { key: 'posted', label: '过账' },
  { key: 'reversed', label: '红冲' },
];

const COLUMNS: readonly TableColumn<VoucherVM>[] = [
  { key: 'no', label: '凭证号', sortable: true, sortValue: (v) => v.no, render: (v) => <span className="wb-mono">{v.no}</span> },
  { key: 'date', label: '日期', sortable: true, sortValue: (v) => v.date, render: (v) => <span className="wb-mono">{formatDate(v.date)}</span> },
  { key: 'summary', label: '摘要', width: '1fr', render: (v) => v.summary },
  { key: 'amount', label: '金额', align: 'end', sortable: true, sortValue: (v) => Number(v.totalDebit), render: (v) => <span className="wb-mono">{formatMoney(v.totalDebit)}</span> },
  { key: 'status', label: '状态', align: 'end', render: (v) => <Badge tone={voucherStatusTone(v.status)} dot>{VOUCHER_STATUS_LABELS[v.status]}</Badge> },
];

export function VouchersClient({ vouchers }: { readonly vouchers: readonly VoucherVM[] }) {
  const [stage, setStage] = useState<Stage>('all');

  const countOf = (s: Stage): number =>
    s === 'all' ? vouchers.length : vouchers.filter((v) => v.status === s).length;
  const filtered = stage === 'all' ? vouchers : vouchers.filter((v) => v.status === stage);

  const nav = (
    <div className="wb-segmented" role="tablist" aria-label="凭证工作流">
      {STAGES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={stage === s.key}
          className={`wb-segmented__item${stage === s.key ? ' wb-segmented__item--active' : ''}`}
          onClick={() => setStage(s.key)}
        >
          {s.label}
          <span className="wb-segmented__count">{countOf(s.key)}</span>
        </button>
      ))}
    </div>
  );

  const actions = (
    <Link href="/finance/vouchers/new" className="mt-btn mt-btn--primary mt-btn--sm">
      新增凭证
    </Link>
  );

  return (
    <ListView<VoucherVM>
      items={filtered}
      nav={nav}
      actions={actions}
      empty={{ title: '暂无凭证', desc: '点击「新增凭证」开始制单。' }}
      present={(items) => (
        <EntityTable<VoucherVM>
          model={{
            columns: COLUMNS,
            rows: items,
            rowKey: (v) => v.id,
            rowHref: (v) => `/finance/vouchers/${v.id}`,
          }}
        />
      )}
    />
  );
}
