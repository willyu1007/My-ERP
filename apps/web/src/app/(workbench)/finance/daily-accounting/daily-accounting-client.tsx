'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EntityTable, ListView, Section, Stat, StatStrip, StatusBadge } from '@my-erp/ui';
import type { TableColumn } from '@my-erp/ui';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { toCents } from '@/lib/finance/money';
import { VOUCHER_STATUS_LABELS, voucherStatusTone } from '@/lib/finance/types';
import type { VoucherVM } from '@/lib/finance/types';

type QueueKey = 'open' | 'draft' | 'pending' | 'posted' | 'reversed' | 'all';

const QUEUES: readonly { readonly key: QueueKey; readonly label: string }[] = [
  { key: 'open', label: '待处理' },
  { key: 'draft', label: '待补全' },
  { key: 'pending', label: '待审核' },
  { key: 'posted', label: '已过账' },
  { key: 'reversed', label: '已红冲' },
  { key: 'all', label: '全部' },
];

const FLOW_STEPS: readonly {
  readonly label: string;
  readonly value: string;
  readonly tone: 'success' | 'warning' | 'muted' | 'danger';
}[] = [
  { label: '录入/收付来源', value: '接收单据', tone: 'muted' },
  { label: '补全凭证', value: '摘要 · 科目 · 金额', tone: 'warning' },
  { label: '审核', value: '职责分离', tone: 'warning' },
  { label: '过账/退回/红冲', value: '入账留痕', tone: 'success' },
];

const COLUMNS: readonly TableColumn<VoucherVM>[] = [
  {
    key: 'no',
    label: '凭证号',
    sortable: true,
    sortValue: (v) => v.no,
    render: (v) => <span className="wb-mono">{v.no}</span>,
  },
  {
    key: 'date',
    label: '日期',
    sortable: true,
    sortValue: (v) => v.date,
    render: (v) => <span className="wb-mono">{formatDate(v.date)}</span>,
  },
  { key: 'summary', label: '摘要', width: '1fr', render: (v) => v.summary },
  {
    key: 'amount',
    label: '金额',
    align: 'end',
    sortable: true,
    sortValue: (v) => toCents(v.totalDebit) ?? 0,
    render: (v) => <span className="wb-mono">{formatMoney(v.totalDebit)}</span>,
  },
  {
    key: 'status',
    label: '状态',
    align: 'end',
    render: (v) => (
      <StatusBadge
        tone={voucherStatusTone(v.status) ?? 'muted'}
        dot
        label={VOUCHER_STATUS_LABELS[v.status]}
      />
    ),
  },
];

function matchesQueue(voucher: VoucherVM, queue: QueueKey): boolean {
  if (queue === 'all') return true;
  if (queue === 'open') return voucher.status === 'draft' || voucher.status === 'pending';
  return voucher.status === queue;
}

function countOf(vouchers: readonly VoucherVM[], queue: QueueKey): number {
  return vouchers.filter((v) => matchesQueue(v, queue)).length;
}

export function DailyAccountingClient({
  vouchers,
}: {
  readonly vouchers: readonly VoucherVM[];
}) {
  const [queue, setQueue] = useState<QueueKey>('open');
  const filtered = vouchers.filter((v) => matchesQueue(v, queue));
  const openCount = countOf(vouchers, 'open');
  const draftCount = countOf(vouchers, 'draft');
  const pendingCount = countOf(vouchers, 'pending');
  const postedCount = countOf(vouchers, 'posted');

  const nav = (
    <div className="wb-segmented" role="tablist" aria-label="日常账务处理队列">
      {QUEUES.map((q) => (
        <button
          key={q.key}
          type="button"
          role="tab"
          aria-selected={queue === q.key}
          className={`wb-segmented__item${queue === q.key ? ' wb-segmented__item--active' : ''}`}
          onClick={() => setQueue(q.key)}
        >
          {q.label}
          <span className="wb-segmented__count">{countOf(vouchers, q.key)}</span>
        </button>
      ))}
    </div>
  );

  const actions = (
    <Link href="/finance/vouchers/new" className="mt-btn mt-btn--primary mt-btn--sm">
      录入凭证
    </Link>
  );

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">日常账务处理</h1>
        <p className="wb-muted">录入与收付来源统一进入凭证队列，再完成补全、审核、过账与纠错。</p>
      </div>

      <StatStrip>
        <Stat label="待处理" value={openCount} />
        <Stat label="待补全" value={draftCount} />
        <Stat label="待审核" value={pendingCount} />
        <Stat label="已过账" value={postedCount} />
      </StatStrip>

      <Section title="处理链路">
        <div className="wb-cardgrid">
          {FLOW_STEPS.map((step) => (
            <div key={step.label} className="wb-card">
              <div className="wb-card__head">
                <h3 className="wb-card__title">{step.label}</h3>
                <StatusBadge tone={step.tone} label={step.value} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <ListView<VoucherVM>
        items={filtered}
        nav={nav}
        actions={actions}
        empty={{ title: '暂无待处理事项', desc: '当前队列没有需要处理的凭证。' }}
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
    </div>
  );
}
