'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ActionButton, ListView, Queue, StatusBadge, type RowModel } from '@my-erp/ui';
import type { CashFlowItem, Contract } from '@my-erp/api-client';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { VOUCHER_STATUS_LABELS, voucherStatusTone } from '@/lib/finance/types';
import type { AccountVM, VoucherStatus, VoucherVM } from '@/lib/finance/types';
import { CaptureButton } from './capture-button';
import { VoucherFastEntry } from './voucher-fast-entry';
import styles from './daily-accounting-client.module.css';

type QueueKey = 'open' | 'draft' | 'pending' | 'posted' | 'reversed' | 'all';

const QUEUES: readonly { readonly key: QueueKey; readonly label: string }[] = [
  { key: 'open', label: '待处理' },
  { key: 'draft', label: '待补全' },
  { key: 'pending', label: '待审核' },
  { key: 'posted', label: '已过账' },
  { key: 'reversed', label: '已红冲' },
  { key: 'all', label: '全部' },
];

function matchesQueue(voucher: VoucherVM, queue: QueueKey): boolean {
  if (queue === 'all') return true;
  if (queue === 'open') return voucher.status === 'draft' || voucher.status === 'pending';
  return voucher.status === queue;
}

function countOf(vouchers: readonly VoucherVM[], queue: QueueKey): number {
  return vouchers.filter((v) => matchesQueue(v, queue)).length;
}

function nextStep(status: VoucherStatus): string {
  switch (status) {
    case 'draft':
      return '提交审核';
    case 'pending':
      return '主管审核';
    case 'posted':
      return '账簿与报表';
    case 'reversed':
      return '审计留痕';
  }
}

function actionLabel(status: VoucherStatus): string {
  switch (status) {
    case 'draft':
      return '补全';
    case 'pending':
      return '审核';
    case 'posted':
    case 'reversed':
      return '查看';
  }
}

function voucherToRow(voucher: VoucherVM): RowModel {
  return {
    title: voucher.summary,
    sub: voucher.no,
    note: `来源：${voucher.maker} 制单 · 当前：${VOUCHER_STATUS_LABELS[voucher.status]} · 下游：${nextStep(voucher.status)}`,
    meta: [
      { text: formatDate(voucher.date) },
      { text: `${voucher.attachments} 附件` },
    ],
    metrics: [{ label: '金额', value: `${formatMoney(voucher.totalDebit)} CNY` }],
    status: {
      tone: voucherStatusTone(voucher.status) ?? 'muted',
      label: VOUCHER_STATUS_LABELS[voucher.status],
    },
    emphasis: voucher.status === 'pending' ? 'warning' : undefined,
  };
}

function drawerFor(voucher: VoucherVM, close: () => void) {
  return {
    title: `${actionLabel(voucher.status)} · ${voucher.no}`,
    desc: `${formatDate(voucher.date)} · ${formatMoney(voucher.totalDebit)} CNY`,
    body: (
      <div className="wb-stack">
        <div>
          <h3 className="wb-card__title">摘要</h3>
          <p className={styles.drawerText}>{voucher.summary}</p>
        </div>
        <div>
          <h3 className="wb-card__title">流转</h3>
          <div className={styles.drawerFlow}>
            <span>来源：{voucher.maker} 制单</span>
            <span>当前：{VOUCHER_STATUS_LABELS[voucher.status]}</span>
            <span>下游：{nextStep(voucher.status)}</span>
          </div>
        </div>
        <div>
          <h3 className="wb-card__title">状态</h3>
          <StatusBadge
            tone={voucherStatusTone(voucher.status) ?? 'muted'}
            dot
            label={VOUCHER_STATUS_LABELS[voucher.status]}
          />
        </div>
      </div>
    ),
    footer: (
      <>
        <button type="button" className="mt-btn mt-btn--secondary" onClick={close}>
          取消
        </button>
        <Link href={`/finance/vouchers/${voucher.id}`} className="mt-btn mt-btn--primary">
          打开详情
        </Link>
      </>
    ),
  };
}

export function DailyAccountingClient({
  vouchers,
  accounts,
  cashFlowItems,
  contracts,
  initialDate,
  demo = false,
}: {
  readonly vouchers: readonly VoucherVM[];
  readonly accounts: readonly AccountVM[];
  readonly cashFlowItems: readonly CashFlowItem[];
  readonly contracts: readonly Contract[];
  readonly initialDate: string;
  /** Fixtures/demo mode (no backend) — shows a "演示数据" badge. */
  readonly demo?: boolean;
}) {
  const [queue, setQueue] = useState<QueueKey>('open');
  const [entryOpen, setEntryOpen] = useState(false);
  const filtered = vouchers.filter((v) => matchesQueue(v, queue));

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

  // 快速制单 slides a fast-entry panel down from this action; the form stays
  // mounted (collapsed) so in-progress input survives queue switches.
  const actions = (
    <div className={styles.actions}>
      {demo && <span className={styles.demoBadge}>演示数据</span>}
      <ActionButton kind="primary" onClick={() => setEntryOpen((v) => !v)}>
        {entryOpen ? '收起录入' : '快速制单'}
      </ActionButton>
    </div>
  );

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <ListView<VoucherVM>
        items={filtered}
        nav={nav}
        actions={actions}
        empty={{ title: '暂无待处理事项', desc: '当前队列没有需要处理的凭证。' }}
        present={(items) => (
          <div>
            <div
              className={`${styles.entryPanel}${entryOpen ? ` ${styles.entryPanelOpen}` : ''}`}
              inert={!entryOpen}
            >
              <div className={styles.entryPanelInner}>
                <VoucherFastEntry
                  accounts={accounts}
                  cashFlowItems={cashFlowItems}
                  contracts={contracts}
                  initialDate={initialDate}
                  headerAction={<CaptureButton />}
                />
              </div>
            </div>
            <div className={styles.queueScope}>
              <Queue<VoucherVM>
                items={items}
                rowKey={(voucher) => voucher.id}
                toRow={voucherToRow}
                actionLabel={(voucher) => actionLabel(voucher.status)}
                drawer={drawerFor}
                empty={{ title: '暂无待处理事项', desc: '当前队列没有需要处理的凭证。' }}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}
