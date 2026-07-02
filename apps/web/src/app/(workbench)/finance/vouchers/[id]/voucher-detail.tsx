'use client';

import { Breadcrumb, Section, StatusBadge } from '@my-erp/ui/primitives';
import { formatDate, formatMoney, formatPeriod } from '@/lib/finance/format';
import { VOUCHER_STATUS_LABELS, voucherStatusTone } from '@/lib/finance/types';
import type { VoucherVM } from '@/lib/finance/types';

/**
 * 凭证详情。草稿凭证由页面组件先路由到快录编辑器；这里仅渲染
 * pending/posted/reversed 等非草稿凭证的只读详情，避免非持久化动作。
 */
export function VoucherDetail({ voucher }: { readonly voucher: VoucherVM }) {
  const meta: readonly (readonly [string, string])[] = [
    ['日期', formatDate(voucher.date)],
    ['期间', formatPeriod(voucher.period)],
    ['制单人', voucher.maker],
    ['审核人', voucher.checker ?? '—'],
    ['附件', `${voucher.attachments} 个`],
  ];

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Breadcrumb
        items={[
          { label: '日常账务处理', href: '/finance/daily-accounting' },
          { label: voucher.no },
        ]}
      />

      <div className="wb-grid wb-grid--sidebar">
        <Section title="分录">
          <div className="wb-table-wrap">
            <table className="wb-table">
              <thead>
                <tr>
                  <th className="wb-table__th">摘要</th>
                  <th className="wb-table__th">科目</th>
                  <th className="wb-table__th wb-table__cell--end">借方</th>
                  <th className="wb-table__th wb-table__cell--end">贷方</th>
                </tr>
              </thead>
              <tbody>
                {voucher.lines.map((l) => (
                  <tr key={l.id} className="wb-table__row">
                    <td>{l.summary}</td>
                    <td>
                      <span className="wb-mono">{l.accountCode}</span> {l.accountName}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {l.debit ? formatMoney(l.debit) : ''}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {l.credit ? formatMoney(l.credit) : ''}
                    </td>
                  </tr>
                ))}
                <tr className="wb-table__row">
                  <td>合计</td>
                  <td />
                  <td className="wb-table__cell--end wb-mono">{formatMoney(voucher.totalDebit)}</td>
                  <td className="wb-table__cell--end wb-mono">
                    {formatMoney(voucher.totalCredit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="wb-row">
            <StatusBadge
              tone={voucher.balanced ? 'success' : 'danger'}
              dot
              label={voucher.balanced ? '借贷平衡' : '借贷不平'}
            />
          </div>
        </Section>

        <div className="wb-card">
          <div className="wb-card__head">
            <h3 className="wb-card__title">{voucher.summary}</h3>
            <StatusBadge
              tone={voucherStatusTone(voucher.status) ?? 'muted'}
              dot
              label={VOUCHER_STATUS_LABELS[voucher.status]}
            />
          </div>

          <div className="wb-stack wb-stack--sm">
            {meta.map(([k, v]) => (
              <div key={k} className="wb-row">
                <span className="wb-muted">{k}</span>
                <span className="wb-spacer" />
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
