import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, Section, StatusBadge } from '@my-erp/ui';
import type { TimelineItem } from '@my-erp/api-client';
import { getContractTimeline } from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';
import {
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  TIMELINE_KIND,
  contractStatusTone,
} from '@/lib/finance/contract-display';
import { ContractStatusActions } from './contract-status-actions';
import styles from '../contracts.module.css';

export const dynamic = 'force-dynamic';

function hrefFor(item: TimelineItem): string | null {
  if (item.refType === 'JournalVoucher') return `/finance/vouchers/${item.refId}`;
  if (item.refType === 'PaymentDoc') return `/finance/payments/${item.refId}`;
  return null;
}

export default async function ContractDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const data = await getContractTimeline(id);
  if (!data) notFound();
  const c = data.contract;

  const rows: readonly [string, string][] = [
    ['类型', CONTRACT_TYPE[c.type] ?? c.type],
    ['对方单位', c.counterparty],
    ['合同金额', c.amount ? formatMoney(c.amount) : '—'],
    ['摘要', c.summary],
    ['制单人', c.createdBy],
  ];

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Breadcrumb items={[{ label: '合同', href: '/finance/contracts' }, { label: c.code }]} />

      <Section title={`${c.code} · ${c.title}`}>
        <div className="wb-row wb-row--wrap">
          <StatusBadge tone={contractStatusTone(c.status)} dot label={CONTRACT_STATUS[c.status] ?? c.status} />
        </div>
        <div className={styles.detailGrid}>
          {rows.map(([k, v]) => (
            <div key={k} className={styles.detailRow}>
              <span className={styles.detailKey}>{k}</span>
              <span className={`${styles.detailVal} wb-mono`}>{v}</span>
            </div>
          ))}
        </div>
        <ContractStatusActions id={c.id} version={c.version} status={c.status} />
      </Section>

      <Section title="交易时间线">
        {data.items.length <= 1 ? (
          <p className="wb-muted">尚无关联凭证/收付款。录入凭证或收付款单时选择本合同即可串联。</p>
        ) : null}
        <div className={styles.timeline}>
          {data.items.map((item, i) => {
            const href = hrefFor(item);
            const title = href ? (
              <Link className={styles.tlTitle} href={href}>
                {item.title}
              </Link>
            ) : (
              <span className={styles.tlTitle}>{item.title}</span>
            );
            return (
              <div key={`${item.refType}-${item.refId}-${i}`} className={styles.tlItem}>
                <div className={styles.tlHead}>
                  <span className={styles.tlDate}>{item.date}</span>
                  <span className="wb-muted" style={{ fontSize: "var(--caption-size)" }}>
                    [{TIMELINE_KIND[item.kind] ?? item.kind}]
                  </span>
                  {title}
                  {item.amount ? (
                    <span className={`${styles.tlAmount} wb-mono`}>{formatMoney(item.amount)}</span>
                  ) : null}
                </div>
                {item.summary ? <div className={styles.tlSummary}>{item.summary}</div> : null}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
