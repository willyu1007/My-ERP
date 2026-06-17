import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, Section, StatusBadge } from '@my-erp/ui';
import { getPayment } from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';
import { PAYMENT_DIRECTION, PAYMENT_STATUS, paymentStatusTone } from '@/lib/finance/payment-display';
import { PaymentDetailActions } from './payment-detail-actions';
import styles from '../payments.module.css';

export const dynamic = 'force-dynamic';

export default async function PaymentDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const p = await getPayment(id);
  if (!p) notFound();

  const rows: readonly [string, string][] = [
    ['类型', PAYMENT_DIRECTION[p.direction] ?? p.direction],
    ['对方', p.counterparty],
    ['金额', formatMoney(p.amount)],
    ['日期', p.date],
    ['会计期间', p.period],
    ['货币资金科目', p.cashAccountCode],
    ['对方科目', p.contraAccountCode],
    ['摘要', p.summary],
    ['制单人', p.maker],
    ['审批人', p.approver ?? '—'],
    ['确认人', p.confirmer ?? '—'],
  ];

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Breadcrumb
        items={[{ label: '出纳收付款', href: '/finance/payments' }, { label: p.no }]}
      />

      <Section title={`${p.no} · ${PAYMENT_DIRECTION[p.direction] ?? ''}`}>
        <div className="wb-row wb-row--wrap">
          <StatusBadge
            tone={paymentStatusTone(p.status)}
            dot
            label={PAYMENT_STATUS[p.status] ?? p.status}
          />
          {p.settlementVoucherId && (
            <Link className="wb-muted" href={`/finance/vouchers/${p.settlementVoucherId}`}>
              查看结算凭证 →
            </Link>
          )}
        </div>

        <div className={styles.detailGrid}>
          {rows.map(([k, v]) => (
            <div key={k} className={styles.detailRow}>
              <span className={styles.detailKey}>{k}</span>
              <span className={`${styles.detailVal} wb-mono`}>{v}</span>
            </div>
          ))}
        </div>

        <PaymentDetailActions id={p.id} version={p.version} status={p.status} />
      </Section>
    </div>
  );
}
