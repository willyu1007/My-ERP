import Link from 'next/link';
import { Badge, Section, Stat, StatStrip } from '@my-erp/ui';
import { getTrialBalance } from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';

export const dynamic = 'force-dynamic';

/** Blank out a zero amount so the grid reads like a paper trial balance. */
const cell = (amount: string): string => (amount === '0.00' ? '' : formatMoney(amount));

export default async function LedgerPage() {
  const tb = await getTrialBalance();
  const allBalanced = tb.balanced.opening && tb.balanced.period && tb.balanced.closing;

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">账簿 · 试算平衡表</h1>
        <p className="wb-muted">从已过账凭证 + 期初余额派生（演示）。点击科目查看明细账。</p>
      </div>

      <StatStrip>
        <Stat label="本期借方发生" value={formatMoney(tb.totals.periodDebit)} />
        <Stat label="本期贷方发生" value={formatMoney(tb.totals.periodCredit)} />
        <Stat label="期末借方合计" value={formatMoney(tb.totals.closingDebit)} />
        <Stat label="试算" value={allBalanced ? '平衡' : '不平'} />
      </StatStrip>

      <Section title="试算平衡表">
        <div className="wb-row wb-row--wrap">
          <Badge tone={tb.balanced.opening ? 'success' : 'danger'} dot>期初 {tb.balanced.opening ? '平衡' : '不平'}</Badge>
          <Badge tone={tb.balanced.period ? 'success' : 'danger'} dot>本期 {tb.balanced.period ? '平衡' : '不平'}</Badge>
          <Badge tone={tb.balanced.closing ? 'success' : 'danger'} dot>期末 {tb.balanced.closing ? '平衡' : '不平'}</Badge>
        </div>
        <div className="wb-table-wrap">
          <table className="wb-table">
            <thead>
              <tr>
                <th className="wb-table__th">科目</th>
                <th className="wb-table__th wb-table__cell--end">期初借</th>
                <th className="wb-table__th wb-table__cell--end">期初贷</th>
                <th className="wb-table__th wb-table__cell--end">本期借</th>
                <th className="wb-table__th wb-table__cell--end">本期贷</th>
                <th className="wb-table__th wb-table__cell--end">期末借</th>
                <th className="wb-table__th wb-table__cell--end">期末贷</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.code} className="wb-table__row">
                  <td>
                    <Link href={`/finance/ledger/${r.code}`}>
                      <span className="wb-mono">{r.code}</span> {r.name}
                    </Link>
                  </td>
                  <td className="wb-table__cell--end wb-mono">{cell(r.openingDebit)}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(r.openingCredit)}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(r.periodDebit)}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(r.periodCredit)}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(r.closingDebit)}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(r.closingCredit)}</td>
                </tr>
              ))}
              <tr className="wb-table__row">
                <td>合计</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(tb.totals.openingDebit)}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(tb.totals.openingCredit)}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(tb.totals.periodDebit)}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(tb.totals.periodCredit)}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(tb.totals.closingDebit)}</td>
                <td className="wb-table__cell--end wb-mono">{formatMoney(tb.totals.closingCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
