'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { BusinessPartner, Contract } from '@my-erp/api-client';
import type { RowModel } from '@my-erp/ui/contracts';
import { ActionButton, Scene, StatusBadge } from '@my-erp/ui/primitives';
import { Queue } from '@my-erp/ui/queue';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { CONTRACT_STATUS, CONTRACT_TYPE, contractStatusTone } from '@/lib/finance/contract-display';
import { ContractCreateForm } from './contract-create-form';
import styles from './contracts.module.css';

type ContractQueueKey = 'incomplete' | 'active' | 'expiring' | 'closed' | 'all';

const CONTRACT_QUEUES: readonly { readonly key: ContractQueueKey; readonly label: string }[] = [
  { key: 'incomplete', label: '待完善' },
  { key: 'active', label: '执行中' },
  { key: 'expiring', label: '临近到期' },
  { key: 'closed', label: '已归档' },
  { key: 'all', label: '全部' },
];

const EXPIRING_DAYS = 30;

function dateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysUntil(date: string, today: Date): number | null {
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((dateOnly(target).getTime() - dateOnly(today).getTime()) / 86_400_000);
}

function isIncomplete(contract: Contract): boolean {
  return (
    contract.status !== 'closed' &&
    (contract.status === 'draft' ||
      contract.counterparty.trim() === '' ||
      !contract.amount ||
      !contract.startDate ||
      !contract.endDate ||
      contract.summary.trim() === '')
  );
}

function isExpiring(contract: Contract, today: Date): boolean {
  if (contract.status !== 'active' || !contract.endDate) return false;
  const days = daysUntil(contract.endDate, today);
  return days !== null && days <= EXPIRING_DAYS;
}

function matchesQueue(contract: Contract, queue: ContractQueueKey, today: Date): boolean {
  if (queue === 'all') return true;
  if (queue === 'incomplete') return isIncomplete(contract);
  if (queue === 'expiring') return isExpiring(contract, today);
  if (queue === 'active') return contract.status === 'active' && !isExpiring(contract, today);
  return contract.status === queue;
}

function countOf(contracts: readonly Contract[], queue: ContractQueueKey, today: Date): number {
  return contracts.filter((contract) => matchesQueue(contract, queue, today)).length;
}

function periodLabel(contract: Contract): string {
  if (contract.startDate && contract.endDate) {
    return `${formatDate(contract.startDate)} 至 ${formatDate(contract.endDate)}`;
  }
  if (contract.startDate) return `${formatDate(contract.startDate)} 起`;
  if (contract.endDate) return `截至 ${formatDate(contract.endDate)}`;
  return '未录入期限';
}

function termStatus(contract: Contract, today: Date): string {
  if (!contract.endDate) return '待补期限';
  const days = daysUntil(contract.endDate, today);
  if (days === null) return '期限异常';
  if (days < 0) return '已到期';
  if (days <= EXPIRING_DAYS) return `${days} 天后到期`;
  return '期限正常';
}

function actionLabel(contract: Contract, today: Date): string {
  if (contract.status === 'closed') return '查看';
  if (isIncomplete(contract)) return '补全';
  if (isExpiring(contract, today)) return '跟进';
  return '查看';
}

function contractToRow(contract: Contract, today: Date): RowModel {
  return {
    title: `${contract.code} · ${contract.title}`,
    sub: CONTRACT_TYPE[contract.type] ?? contract.type,
    note: `对方：${contract.counterparty || '未录入'} · 类型：${
      CONTRACT_TYPE[contract.type] ?? contract.type
    } · 履约期限：${periodLabel(contract)}`,
    meta: [
      { text: `创建 ${formatDate(contract.createdAt.slice(0, 10))}` },
      { text: contract.summary ? '结构化条款已录入' : '待补结构化条款' },
    ],
    metrics: [
      { label: '金额', value: contract.amount ? `${formatMoney(contract.amount)} CNY` : '待补' },
      { label: '期限', value: termStatus(contract, today) },
    ],
    status: {
      tone: contractStatusTone(contract.status),
      label: CONTRACT_STATUS[contract.status] ?? contract.status,
    },
    emphasis: isIncomplete(contract) || isExpiring(contract, today) ? 'warning' : undefined,
  };
}

function drawerFor(contract: Contract, today: Date, close: () => void) {
  return {
    title: `${actionLabel(contract, today)} · ${contract.code}`,
    desc: `${CONTRACT_TYPE[contract.type] ?? contract.type} · ${contract.counterparty || '未录入对方'}`,
    body: (
      <div className="wb-stack">
        <div>
          <h3 className="wb-card__title">合同概览</h3>
          <div className={styles.drawerFlow}>
            <span>名称：{contract.title}</span>
            <span>对方：{contract.counterparty || '未录入'}</span>
            <span>金额：{contract.amount ? `${formatMoney(contract.amount)} CNY` : '待补'}</span>
            <span>履约期限：{periodLabel(contract)}</span>
            <span>期限状态：{termStatus(contract, today)}</span>
          </div>
        </div>
        <div>
          <h3 className="wb-card__title">结构化条款</h3>
          <p className={styles.drawerText}>
            {contract.summary || '尚未录入付款条款、验收要求、指标或违约责任。'}
          </p>
        </div>
        <div>
          <h3 className="wb-card__title">合同原文</h3>
          <div className={styles.drawerFlow}>
            <span>原文入库、OCR 与条款结构化将在后续接入。</span>
            <button type="button" className="mt-btn mt-btn--secondary" disabled>
              上传原文
            </button>
          </div>
        </div>
        <div>
          <h3 className="wb-card__title">状态</h3>
          <StatusBadge
            tone={contractStatusTone(contract.status)}
            dot
            label={CONTRACT_STATUS[contract.status] ?? contract.status}
          />
        </div>
      </div>
    ),
    footer: (
      <>
        <button type="button" className="mt-btn mt-btn--secondary" onClick={close}>
          取消
        </button>
        <Link href={`/finance/contracts/${contract.id}`} className="mt-btn mt-btn--primary">
          打开详情
        </Link>
      </>
    ),
  };
}

export function ContractsClient({
  contracts,
  partners,
  filterPartner = null,
  initialEntryOpen = false,
}: {
  readonly contracts: readonly Contract[];
  readonly partners: readonly BusinessPartner[];
  readonly filterPartner?: BusinessPartner | null;
  readonly initialEntryOpen?: boolean;
}) {
  const [queue, setQueue] = useState<ContractQueueKey>('incomplete');
  const [entryOpen, setEntryOpen] = useState(initialEntryOpen);
  const today = new Date();
  const filtered = contracts.filter((contract) => matchesQueue(contract, queue, today));

  const nav = (
    <div className={styles.navActions}>
      <ActionButton kind="primary" onClick={() => setEntryOpen((value) => !value)}>
        {entryOpen ? '收起登记' : '登记合同'}
      </ActionButton>
      {filterPartner ? (
        <span className={styles.filterChip}>
          对方：{filterPartner.name}
          <Link href="/finance/contracts" aria-label="清除往来单位筛选">
            ×
          </Link>
        </span>
      ) : null}
      <div className="wb-segmented" role="tablist" aria-label="合同工作台队列">
        {CONTRACT_QUEUES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={queue === item.key}
            className={`wb-segmented__item${queue === item.key ? ' wb-segmented__item--active' : ''}`}
            onClick={() => setQueue(item.key)}
          >
            {item.label}
            <span className="wb-segmented__count">{countOf(contracts, item.key, today)}</span>
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
          <ContractCreateForm partners={partners} />
        </div>
      </div>
      <div className={styles.queueScope}>
        <Queue<Contract>
          items={filtered}
          rowKey={(contract) => contract.id}
          toRow={(contract) => contractToRow(contract, today)}
          actionLabel={(contract) => actionLabel(contract, today)}
          drawer={(contract, close) => drawerFor(contract, today, close)}
          empty={{ title: '暂无合同', desc: '当前队列没有需要处理的合同。' }}
        />
      </div>
    </Scene>
  );
}
