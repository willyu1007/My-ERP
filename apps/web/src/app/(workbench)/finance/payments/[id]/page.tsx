import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, Section, StatusBadge } from '@my-erp/ui/primitives';
import {
  getAccountingCapable,
  getPayment,
  listAccounts,
  listCashFlowItems,
} from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';
import {
  PAYMENT_DIRECTION,
  PAYMENT_STATUS,
  paymentStatusTone,
} from '@/lib/finance/payment-display';
import { PaymentDetailActions } from './payment-detail-actions';
import { PaymentEnrichForm } from './payment-enrich-form';
import styles from '../payments.module.css';

export const dynamic = 'force-dynamic';

/** Human-readable contra aux summary (keyed by AuxType). */
function auxSummary(aux: unknown): string {
  if (!aux || typeof aux !== 'object') return '—';
  const entries = Object.entries(aux as Record<string, unknown>).map(([, v]) => {
    if (v && typeof v === 'object' && 'name' in v) return String((v as { name: unknown }).name);
    return String(v);
  });
  return entries.length > 0 ? entries.join('、') : '—';
}

export default async function PaymentDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const p = await getPayment(id);
  if (!p) notFound();

  const awaitingAccounting = p.status === 'pending_accounting';
  const [canEnterAccounting, accounts, cashFlowItems] = awaitingAccounting
    ? await Promise.all([getAccountingCapable(), listAccounts(), listCashFlowItems()])
    : [false, [], []];

  const rows: readonly [string, string][] = [
    ['类型', PAYMENT_DIRECTION[p.direction] ?? p.direction],
    ['对方', p.counterparty],
    ['金额', formatMoney(p.amount)],
    ['日期', p.date],
    ['会计期间', p.period],
    ['货币资金科目', p.cashAccountCode ?? '待会计补录'],
    ['对方科目', p.contraAccountCode ?? '待会计补录'],
    ['辅助核算', auxSummary(p.contraAux)],
    ['现金流量项目', p.cashFlowItem ?? '—'],
    ['摘要', p.summary],
    ['制单人', p.maker],
    ['审批人', p.approver ?? '—'],
    ['确认人', p.confirmer ?? '—'],
  ];

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Breadcrumb items={[{ label: '出纳收付款', href: '/finance/payments' }, { label: p.no }]} />

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

        {awaitingAccounting ? (
          canEnterAccounting ? (
            <PaymentEnrichForm
              id={p.id}
              version={p.version}
              direction={p.direction}
              partnerId={p.partnerId ?? null}
              counterparty={p.counterparty}
              accounts={accounts}
              cashFlowItems={cashFlowItems}
            />
          ) : (
            <span className="wb-muted">等待会计补录会计科目后方可提交审批。</span>
          )
        ) : null}

        <PaymentDetailActions id={p.id} version={p.version} status={p.status} />
      </Section>
    </div>
  );
}
