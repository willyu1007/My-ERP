'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { RowModel } from '@my-erp/ui/contracts';
import { ActionButton, Scene, StatusBadge } from '@my-erp/ui/primitives';
import { Queue } from '@my-erp/ui/queue';
import type { AccountVM } from '@/lib/finance/types';
import type { BusinessPartner, Contract, PaymentDoc, PaymentStatus } from '@my-erp/api-client';
import { formatDate, formatMoney } from '@/lib/finance/format';
import {
  PAYMENT_DIRECTION,
  PAYMENT_STATUS,
  paymentStatusTone,
} from '@/lib/finance/payment-display';
import { PaymentCreateForm } from './payment-create-form';
import styles from './payments.module.css';

type PaymentQueueKey =
  | 'open'
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'confirmed'
  | 'void'
  | 'all';

const PAYMENT_QUEUES: readonly { readonly key: PaymentQueueKey; readonly label: string }[] = [
  { key: 'open', label: '待处理' },
  { key: 'draft', label: '草稿' },
  { key: 'pending_approval', label: '待审批' },
  { key: 'approved', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'void', label: '已作废' },
  { key: 'all', label: '全部' },
];

function matchesQueue(payment: PaymentDoc, queue: PaymentQueueKey): boolean {
  if (queue === 'all') return true;
  if (queue === 'open') {
    return (
      payment.status === 'draft' ||
      payment.status === 'pending_approval' ||
      payment.status === 'approved'
    );
  }
  return payment.status === queue;
}

function countOf(payments: readonly PaymentDoc[], queue: PaymentQueueKey): number {
  return payments.filter((payment) => matchesQueue(payment, queue)).length;
}

function nextStep(status: PaymentStatus): string {
  switch (status) {
    case 'draft':
      return '提交审批';
    case 'pending_approval':
      return '主管审批';
    case 'approved':
      return '确认收付并过账';
    case 'confirmed':
      return '结算凭证与账簿';
    case 'void':
      return '审计留痕';
  }
}

function actionLabel(status: PaymentStatus): string {
  switch (status) {
    case 'draft':
      return '补全';
    case 'pending_approval':
      return '审批';
    case 'approved':
      return '确认';
    case 'confirmed':
    case 'void':
      return '查看';
  }
}

function paymentToRow(payment: PaymentDoc): RowModel {
  return {
    title: payment.summary,
    sub: payment.no,
    note: `对方：${payment.counterparty} · 类型：${PAYMENT_DIRECTION[payment.direction] ?? payment.direction} · 下游：${nextStep(payment.status)}`,
    meta: [{ text: formatDate(payment.date) }, { text: `账户 ${payment.cashAccountCode}` }],
    metrics: [{ label: '金额', value: `${formatMoney(payment.amount)} CNY` }],
    status: {
      tone: paymentStatusTone(payment.status),
      label: PAYMENT_STATUS[payment.status] ?? payment.status,
    },
    emphasis:
      payment.status === 'pending_approval' || payment.status === 'approved'
        ? 'warning'
        : undefined,
  };
}

function drawerFor(payment: PaymentDoc, close: () => void) {
  return {
    title: `${actionLabel(payment.status)} · ${payment.no}`,
    desc: `${formatDate(payment.date)} · ${formatMoney(payment.amount)} CNY`,
    body: (
      <div className="wb-stack">
        <div>
          <h3 className="wb-card__title">摘要</h3>
          <p className={styles.drawerText}>{payment.summary}</p>
        </div>
        <div>
          <h3 className="wb-card__title">流转</h3>
          <div className={styles.drawerFlow}>
            <span>类型：{PAYMENT_DIRECTION[payment.direction] ?? payment.direction}</span>
            <span>对方：{payment.counterparty}</span>
            <span>当前：{PAYMENT_STATUS[payment.status] ?? payment.status}</span>
            <span>下游：{nextStep(payment.status)}</span>
          </div>
        </div>
        <div>
          <h3 className="wb-card__title">状态</h3>
          <StatusBadge
            tone={paymentStatusTone(payment.status)}
            dot
            label={PAYMENT_STATUS[payment.status] ?? payment.status}
          />
        </div>
      </div>
    ),
    footer: (
      <>
        <button type="button" className="mt-btn mt-btn--secondary" onClick={close}>
          取消
        </button>
        <Link href={`/finance/payments/${payment.id}`} className="mt-btn mt-btn--primary">
          打开详情
        </Link>
      </>
    ),
  };
}

export function PaymentsClient({
  payments,
  accounts,
  contracts,
  partners,
  filterPartner = null,
  initialDate,
  initialEntryOpen = false,
}: {
  readonly payments: readonly PaymentDoc[];
  readonly accounts: readonly AccountVM[];
  readonly contracts: readonly Contract[];
  readonly partners: readonly BusinessPartner[];
  readonly filterPartner?: BusinessPartner | null;
  readonly initialDate: string;
  readonly initialEntryOpen?: boolean;
}) {
  const [queue, setQueue] = useState<PaymentQueueKey>('open');
  const [entryOpen, setEntryOpen] = useState(initialEntryOpen);
  const filtered = payments.filter((payment) => matchesQueue(payment, queue));

  const nav = (
    <div className={styles.navActions}>
      <ActionButton kind="primary" onClick={() => setEntryOpen((value) => !value)}>
        {entryOpen ? '收起登记' : '登记收付'}
      </ActionButton>
      {filterPartner ? (
        <span className={styles.filterChip}>
          对方：{filterPartner.name}
          <Link href="/finance/payments" aria-label="清除往来单位筛选">
            ×
          </Link>
        </span>
      ) : null}
      <div className="wb-segmented" role="tablist" aria-label="出纳收付队列">
        {PAYMENT_QUEUES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={queue === item.key}
            className={`wb-segmented__item${queue === item.key ? ' wb-segmented__item--active' : ''}`}
            onClick={() => setQueue(item.key)}
          >
            {item.label}
            <span className="wb-segmented__count">{countOf(payments, item.key)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Scene nav={nav}>
      <div
        className={`${styles.entryPanel}${entryOpen ? ` ${styles.entryPanelOpen}` : ''}`}
        inert={!entryOpen}
      >
        <div className={styles.entryPanelInner}>
          <PaymentCreateForm
            accounts={accounts}
            contracts={contracts}
            partners={partners}
            initialDate={initialDate}
          />
        </div>
      </div>
      <div className={styles.queueScope}>
        <Queue<PaymentDoc>
          items={filtered}
          rowKey={(payment) => payment.id}
          toRow={paymentToRow}
          actionLabel={(payment) => actionLabel(payment.status)}
          drawer={drawerFor}
          empty={{ title: '暂无待处理收付', desc: '当前队列没有需要处理的收付款单。' }}
        />
      </div>
    </Scene>
  );
}
