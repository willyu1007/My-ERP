'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessPartner, Membership } from '@my-erp/api-client';
import type { RowModel } from '@my-erp/ui/contracts';
import { useToast } from '@my-erp/ui/feedback';
import { ActionButton, Scene, StatusBadge } from '@my-erp/ui/primitives';
import { Queue } from '@my-erp/ui/queue';
import { PARTNER_PARTY_TYPE, partnerRolesLabel } from '@/lib/finance/partner-display';
import { updateBusinessPartnerAction } from './actions';
import { PartnerCreateForm } from './partner-create-form';
import chrome from '../_components/queue-page.module.css';
import styles from './partners.module.css';

type PartnerQueueKey = 'customer' | 'supplier' | 'individual' | 'inactive' | 'all';

const PARTNER_QUEUES: readonly { readonly key: PartnerQueueKey; readonly label: string }[] = [
  { key: 'customer', label: '客户' },
  { key: 'supplier', label: '供应商' },
  { key: 'individual', label: '员工/个人' },
  { key: 'inactive', label: '已停用' },
  { key: 'all', label: '全部' },
];

function matchesQueue(partner: BusinessPartner, queue: PartnerQueueKey): boolean {
  if (queue === 'all') return true;
  if (queue === 'inactive') return !partner.active;
  if (!partner.active) return false;
  if (queue === 'individual') return partner.partyType === 'individual';
  return partner.roles.includes(queue);
}

function matchesSearch(partner: BusinessPartner, query: string): boolean {
  if (query === '') return true;
  return [partner.name, partner.wechat, ...partner.tags, partnerRolesLabel(partner.roles)]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function countOf(
  partners: readonly BusinessPartner[],
  queue: PartnerQueueKey,
  query: string,
): number {
  return partners.filter((p) => matchesQueue(p, queue) && matchesSearch(p, query)).length;
}

function partnerToRow(partner: BusinessPartner): RowModel {
  const noteParts = [
    `角色：${partnerRolesLabel(partner.roles)}`,
    partner.tags.length > 0 ? `标签：${partner.tags.join('、')}` : '',
    partner.wechat ? `微信：${partner.wechat}` : '',
    partner.memberUserId ? '已关联组织成员' : '',
  ].filter(Boolean);
  return {
    title: partner.name,
    sub: PARTNER_PARTY_TYPE[partner.partyType] ?? partner.partyType,
    note: noteParts.join(' · '),
    meta: [{ text: partner.remark || '无备注' }],
    status: {
      tone: partner.active ? 'success' : 'muted',
      label: partner.active ? '启用' : '已停用',
    },
  };
}

export function PartnersClient({
  partners,
  members,
  initialEntryOpen = false,
}: {
  readonly partners: readonly BusinessPartner[];
  readonly members: readonly Membership[];
  readonly initialEntryOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [queue, setQueue] = useState<PartnerQueueKey>('all');
  const [entryOpen, setEntryOpen] = useState(initialEntryOpen);
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = partners.filter(
    (p) => matchesQueue(p, queue) && matchesSearch(p, normalizedSearch),
  );

  function setActive(partner: BusinessPartner, active: boolean, close: () => void): void {
    start(async () => {
      const res = await updateBusinessPartnerAction(partner.id, {
        expectedVersion: partner.version,
        active,
      });
      if (res.ok) {
        toast.notify('success', active ? '已启用' : '已停用', partner.name);
        close();
        router.refresh();
      } else {
        toast.notify('error', '操作失败', res.message);
      }
    });
  }

  const nav = (
    <div className={chrome.navActions}>
      <ActionButton kind="primary" onClick={() => setEntryOpen((value) => !value)}>
        {entryOpen ? '收起新增' : '新增往来单位'}
      </ActionButton>
      <input
        className={`mt-input ${styles.searchInput}`}
        value={search}
        autoComplete="off"
        placeholder="搜索名称 / 微信号 / 标签"
        aria-label="搜索往来单位"
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="wb-segmented" role="tablist" aria-label="往来单位队列">
        {PARTNER_QUEUES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={queue === item.key}
            className={`wb-segmented__item${queue === item.key ? ' wb-segmented__item--active' : ''}`}
            onClick={() => setQueue(item.key)}
          >
            {item.label}
            <span className="wb-segmented__count">
              {countOf(partners, item.key, normalizedSearch)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Scene nav={nav}>
      <div
        className={`${chrome.entryPanel}${entryOpen ? ` ${chrome.entryPanelOpen}` : ''}`}
        inert={!entryOpen}
      >
        <div className={chrome.entryPanelInner}>
          <PartnerCreateForm members={members} onCreated={() => setEntryOpen(false)} />
        </div>
      </div>
      <div className={chrome.queueScope}>
        <Queue<BusinessPartner>
          items={filtered}
          rowKey={(partner) => partner.id}
          toRow={partnerToRow}
          actionLabel={() => '查看'}
          drawer={(partner, close) => ({
            title: partner.name,
            desc: `${PARTNER_PARTY_TYPE[partner.partyType] ?? partner.partyType} · ${partnerRolesLabel(partner.roles)}`,
            body: (
              <div className="wb-stack">
                <div>
                  <h3 className="wb-card__title">基本信息</h3>
                  <div className={styles.drawerFlow}>
                    <span>名称：{partner.name}</span>
                    <span>类型：{PARTNER_PARTY_TYPE[partner.partyType] ?? partner.partyType}</span>
                    <span>角色：{partnerRolesLabel(partner.roles)}</span>
                    <span>标签：{partner.tags.length > 0 ? partner.tags.join('、') : '无'}</span>
                    <span>微信号：{partner.wechat || '未录入'}</span>
                    <span>组织成员：{partner.memberUserId ? '已关联' : '未关联'}</span>
                    <span>备注：{partner.remark || '无'}</span>
                  </div>
                </div>
                <div>
                  <h3 className="wb-card__title">往来查询</h3>
                  <div className={styles.drawerFlow}>
                    <Link
                      href={`/finance/payments?partnerId=${partner.id}`}
                      className="mt-btn mt-btn--secondary"
                    >
                      查看收付款
                    </Link>
                    <Link
                      href={`/finance/contracts?partnerId=${partner.id}`}
                      className="mt-btn mt-btn--secondary"
                    >
                      查看合同
                    </Link>
                  </div>
                </div>
                <div>
                  <h3 className="wb-card__title">状态</h3>
                  <StatusBadge
                    tone={partner.active ? 'success' : 'muted'}
                    dot
                    label={partner.active ? '启用' : '已停用'}
                  />
                </div>
              </div>
            ),
            footer: (
              <>
                <button type="button" className="mt-btn mt-btn--secondary" onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  className="mt-btn mt-btn--primary"
                  onClick={() => setActive(partner, !partner.active, close)}
                >
                  {partner.active ? '停用' : '启用'}
                </button>
              </>
            ),
          })}
          empty={{ title: '暂无往来单位', desc: '点击「新增往来单位」创建客户、供应商或个人。' }}
        />
      </div>
    </Scene>
  );
}
