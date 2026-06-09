import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, Section } from '@my-erp/ui';
import { getAccountLedger } from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';

export const dynamic = 'force-dynamic';

export default async function AccountLedgerPage({ params }: { readonly params: { readonly code: string } }) {
  const ledger = await getAccountLedger(params.code);
  if (!ledger) notFound();
  const { account, opening, rows, closing } = ledger;

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Breadcrumb items={[{ label: '账簿', href: '/finance/ledger' }, { label: `${account.code} ${account.name}` }]} />

      <Section title={`明细账 · ${account.name}`}>
        <div className="wb-table-wrap">
          <table className="wb-table">
            <thead>
              <tr>
                <th className="wb-table__th">日期</th>
                <th className="wb-table__th">凭证号</th>
                <th className="wb-table__th">摘要</th>
                <th className="wb-table__th wb-table__cell--end">借方</th>
                <th className="wb-table__th wb-table__cell--end">贷方</th>
                <th className="wb-table__th wb-table__cell--center">方向</th>
                <th className="wb-table__th wb-table__cell--end">余额</th>
              </tr>
            </thead>
            <tbody>
              <tr className="wb-table__row">
                <td colSpan={3}>期初余额</td>
                <td className="wb-table__cell--end wb-mono">{opening.debit ? formatMoney(opening.debit) : ''}</td>
                <td className="wb-table__cell--end wb-mono">{opening.credit ? formatMoney(opening.credit) : ''}</td>
                <td className="wb-table__cell--center">{opening.balanceDir}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(opening.balance)}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={`${r.voucherId}-${i}`} className="wb-table__row">
                  <td className="wb-mono">{r.date}</td>
                  <td>
                    <Link href={`/finance/vouchers/${r.voucherId}`}>
                      <span className="wb-mono">{r.voucherNo}</span>
                    </Link>
                  </td>
                  <td>{r.summary}</td>
                  <td className="wb-table__cell--end wb-mono">{r.debit ? formatMoney(r.debit) : ''}</td>
                  <td className="wb-table__cell--end wb-mono">{r.credit ? formatMoney(r.credit) : ''}</td>
                  <td className="wb-table__cell--center">{r.balanceDir}</td>
                  <td className="wb-table__cell--end wb-mono">{formatMoney(r.balance)}</td>
                </tr>
              ))}
              <tr className="wb-table__row">
                <td colSpan={3}>期末余额</td>
                <td className="wb-table__cell--end wb-mono">{closing.debit ? formatMoney(closing.debit) : ''}</td>
                <td className="wb-table__cell--end wb-mono">{closing.credit ? formatMoney(closing.credit) : ''}</td>
                <td className="wb-table__cell--center">{closing.balanceDir}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(closing.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
