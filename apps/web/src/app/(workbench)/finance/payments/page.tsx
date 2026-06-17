import Link from 'next/link';
import { Section, StatusBadge } from '@my-erp/ui';
import type { PaymentStatus } from '@my-erp/api-client';
import { listAccounts, listContracts, listPayments } from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';
import { PAYMENT_DIRECTION, PAYMENT_STATUS, paymentStatusTone } from '@/lib/finance/payment-display';
import { PaymentCreateForm } from './payment-create-form';
import styles from './payments.module.css';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const STATUS_TABS: readonly { readonly key: string; readonly label: string }[] = [
  { key: '', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'pending_approval', label: '待审批' },
  { key: 'approved', label: '已审批' },
  { key: 'confirmed', label: '已确认' },
  { key: 'void', label: '已作废' },
];
const STATUS_SET = new Set(STATUS_TABS.map((t) => t.key).filter(Boolean));

/**
 * 出纳收付款 (T-007 C3) — create a 收/付款单 and track the request→approve→confirm
 * lifecycle. The list is backend-backed; actions live on the detail page.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = first(sp.status);
  const status = raw && STATUS_SET.has(raw) ? (raw as PaymentStatus) : undefined;

  const [payments, accounts, contracts] = await Promise.all([
    listPayments(status ? { status } : undefined),
    listAccounts(),
    listContracts(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">出纳收付款</h1>
        <p className="wb-muted">
          收/付款单：申请 → 审批 → 确认收付（自动生成并过账结算凭证）。系统记录与审批，不代为划款。
        </p>
      </div>

      <PaymentCreateForm accounts={accounts} contracts={contracts} initialDate={today} />

      <Section title="收付款单">
        <div className={styles.tabs}>
          {STATUS_TABS.map((t) => (
            <Link
              key={t.key || 'all'}
              className={`${styles.tab} ${(status ?? '') === t.key ? styles.tabActive : ''}`}
              href={t.key ? `/finance/payments?status=${t.key}` : '/finance/payments'}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {payments.length === 0 ? (
          <p className="wb-muted">暂无收付款单。</p>
        ) : (
          <div className="wb-table-wrap">
            <table className="wb-table">
              <thead>
                <tr>
                  <th className="wb-table__th">单号</th>
                  <th className="wb-table__th">类型</th>
                  <th className="wb-table__th">对方</th>
                  <th className="wb-table__th">摘要</th>
                  <th className="wb-table__th wb-table__cell--end">金额</th>
                  <th className="wb-table__th">状态</th>
                  <th className="wb-table__th">日期</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="wb-table__row">
                    <td>
                      <Link className="wb-mono" href={`/finance/payments/${p.id}`}>
                        {p.no}
                      </Link>
                    </td>
                    <td>{PAYMENT_DIRECTION[p.direction] ?? p.direction}</td>
                    <td>{p.counterparty}</td>
                    <td className="wb-muted">{p.summary}</td>
                    <td className="wb-table__cell--end wb-mono">{formatMoney(p.amount)}</td>
                    <td>
                      <StatusBadge
                        tone={paymentStatusTone(p.status)}
                        dot
                        label={PAYMENT_STATUS[p.status] ?? p.status}
                      />
                    </td>
                    <td className="wb-muted">{p.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
