import Link from 'next/link';
import { Fragment } from 'react';
import { EmptyState } from '@my-erp/ui/primitives';
import { getAccountLedger, getTrialBalance, listAccounts } from '@/lib/finance/data-source';
import type { AccountLedger, TrialBalanceRow } from '@/lib/finance/ledger';
import { formatMoney } from '@/lib/finance/format';
import { centsToString, sumCents } from '@/lib/finance/money';
import { LedgerControls, PeriodPickerButton } from './ledger-controls';
import styles from './ledger.module.css';

export const dynamic = 'force-dynamic';

type LedgerView = 'balances' | 'detail' | 'check';

interface TrialBalanceTotals {
  readonly openingDebit: string;
  readonly openingCredit: string;
  readonly periodDebit: string;
  readonly periodCredit: string;
  readonly closingDebit: string;
  readonly closingCredit: string;
}

interface LedgerSearchParams {
  readonly view?: string | readonly string[];
  readonly account?: string | readonly string[];
  readonly period?: string | readonly string[];
}

interface AccountLabel {
  readonly code: string;
  readonly name: string;
}

const currentPeriod = new Date().toISOString().slice(0, 7);

/** Blank out a zero amount so the grid reads like a paper ledger. */
const cell = (amount: string): string =>
  amount === '0.00' || amount === '' ? '' : formatMoney(amount);

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

function viewOf(value: string | undefined): LedgerView {
  if (value === 'detail' || value === 'check') return value;
  return 'balances';
}

function hasAmount(amount: string): boolean {
  return amount !== '' && amount !== '0.00';
}

function hasPeriodActivity(row: TrialBalanceRow): boolean {
  return hasAmount(row.periodDebit) || hasAmount(row.periodCredit);
}

function periodOf(value: string | undefined): string {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : currentPeriod;
}

function totalsForRows(rows: readonly TrialBalanceRow[]): TrialBalanceTotals {
  return {
    openingDebit: centsToString(sumCents(rows.map((row) => row.openingDebit))),
    openingCredit: centsToString(sumCents(rows.map((row) => row.openingCredit))),
    periodDebit: centsToString(sumCents(rows.map((row) => row.periodDebit))),
    periodCredit: centsToString(sumCents(rows.map((row) => row.periodCredit))),
    closingDebit: centsToString(sumCents(rows.map((row) => row.closingDebit))),
    closingCredit: centsToString(sumCents(rows.map((row) => row.closingCredit))),
  };
}

function ledgerHref({
  view,
  account,
  period,
}: {
  readonly view?: LedgerView;
  readonly account?: string;
  readonly period?: string;
}): string {
  const params = new URLSearchParams();
  if (view && view !== 'balances') params.set('view', view);
  if (account) params.set('account', account);
  if (period && period !== currentPeriod) params.set('period', period);
  const query = params.toString();
  return query ? `/finance/ledger?${query}` : '/finance/ledger';
}

function AccountDetailLink({
  account,
  period,
}: {
  readonly account: AccountLabel;
  readonly period: string;
}) {
  return (
    <Link
      className={styles.accountLink}
      href={ledgerHref({
        view: 'detail',
        account: account.code,
        period,
      })}
    >
      <span className="wb-mono">{account.code}</span>
      <span>{account.name}</span>
    </Link>
  );
}

function TrialStatus({ label, balanced }: { readonly label: string; readonly balanced: boolean }) {
  return (
    <span className={`${styles.trialStatus}${balanced ? '' : ` ${styles.trialStatusDanger}`}`}>
      <span className={styles.trialDot} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function DetailLedgerTable({ ledger }: { readonly ledger: AccountLedger }) {
  return (
    <div className="wb-table-wrap">
      <table className={`wb-table ${styles.ledgerTable}`}>
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
            <td className="wb-table__cell--end wb-mono">{cell(ledger.opening.debit)}</td>
            <td className="wb-table__cell--end wb-mono">{cell(ledger.opening.credit)}</td>
            <td className="wb-table__cell--center">{ledger.opening.balanceDir}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(ledger.opening.balance)}</td>
          </tr>
          {ledger.rows.map((row, index) => (
            <tr key={`${row.voucherId}-${index}`} className="wb-table__row">
              <td className="wb-mono">{row.date}</td>
              <td>
                <Link href={`/finance/vouchers/${row.voucherId}`}>
                  <span className="wb-mono">{row.voucherNo}</span>
                </Link>
              </td>
              <td>{row.summary}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.debit)}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.credit)}</td>
              <td className="wb-table__cell--center">{row.balanceDir}</td>
              <td className="wb-table__cell--end wb-mono">{formatMoney(row.balance)}</td>
            </tr>
          ))}
          <tr className="wb-table__row">
            <td colSpan={3}>期末余额</td>
            <td className="wb-table__cell--end wb-mono">{cell(ledger.closing.debit)}</td>
            <td className="wb-table__cell--end wb-mono">{cell(ledger.closing.credit)}</td>
            <td className="wb-table__cell--center">{ledger.closing.balanceDir}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(ledger.closing.balance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AllDetailLedgerTable({
  ledgers,
  period,
}: {
  readonly ledgers: readonly AccountLedger[];
  readonly period: string;
}) {
  return (
    <div className="wb-table-wrap">
      <table className={`wb-table ${styles.ledgerTable}`}>
        <thead>
          <tr>
            <th className="wb-table__th">科目</th>
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
          {ledgers.map((ledger) => (
            <Fragment key={ledger.account.code}>
              <tr className="wb-table__row">
                <td>
                  <AccountDetailLink account={ledger.account} period={period} />
                </td>
                <td />
                <td />
                <td>期初余额</td>
                <td className="wb-table__cell--end wb-mono">{cell(ledger.opening.debit)}</td>
                <td className="wb-table__cell--end wb-mono">{cell(ledger.opening.credit)}</td>
                <td className="wb-table__cell--center">{ledger.opening.balanceDir}</td>
                <td className="wb-table__cell--end wb-mono">
                  {formatMoney(ledger.opening.balance)}
                </td>
              </tr>
              {ledger.rows.map((row, index) => (
                <tr
                  key={`${ledger.account.code}-${row.voucherId}-${index}`}
                  className="wb-table__row"
                >
                  <td>
                    <AccountDetailLink account={ledger.account} period={period} />
                  </td>
                  <td className="wb-mono">{row.date}</td>
                  <td>
                    <Link href={`/finance/vouchers/${row.voucherId}`}>
                      <span className="wb-mono">{row.voucherNo}</span>
                    </Link>
                  </td>
                  <td>{row.summary}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(row.debit)}</td>
                  <td className="wb-table__cell--end wb-mono">{cell(row.credit)}</td>
                  <td className="wb-table__cell--center">{row.balanceDir}</td>
                  <td className="wb-table__cell--end wb-mono">{formatMoney(row.balance)}</td>
                </tr>
              ))}
              <tr className="wb-table__row">
                <td>
                  <AccountDetailLink account={ledger.account} period={period} />
                </td>
                <td />
                <td />
                <td>期末余额</td>
                <td className="wb-table__cell--end wb-mono">{cell(ledger.closing.debit)}</td>
                <td className="wb-table__cell--end wb-mono">{cell(ledger.closing.credit)}</td>
                <td className="wb-table__cell--center">{ledger.closing.balanceDir}</td>
                <td className="wb-table__cell--end wb-mono">
                  {formatMoney(ledger.closing.balance)}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrialBalanceTable({
  rows,
  totals,
  period,
}: {
  readonly rows: readonly TrialBalanceRow[];
  readonly totals: TrialBalanceTotals;
  readonly period: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title="没有匹配科目" desc="调整科目或会计期间后再查看。" />;
  }

  return (
    <div className="wb-table-wrap">
      <table className={`wb-table ${styles.ledgerTable}`}>
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
          {rows.map((row) => (
            <tr key={row.code} className="wb-table__row">
              <td>
                <AccountDetailLink account={row} period={period} />
              </td>
              <td className="wb-table__cell--end wb-mono">{cell(row.openingDebit)}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.openingCredit)}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.periodDebit)}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.periodCredit)}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.closingDebit)}</td>
              <td className="wb-table__cell--end wb-mono">{cell(row.closingCredit)}</td>
            </tr>
          ))}
          <tr className="wb-table__row">
            <td>合计</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(totals.openingDebit)}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(totals.openingCredit)}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(totals.periodDebit)}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(totals.periodCredit)}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(totals.closingDebit)}</td>
            <td className="wb-table__cell--end wb-mono">{formatMoney(totals.closingCredit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function LedgerPage({
  searchParams,
}: {
  readonly searchParams: Promise<LedgerSearchParams>;
}) {
  const sp = await searchParams;
  const view = viewOf(first(sp.view));
  const period = periodOf(first(sp.period));
  const [tb, accounts] = await Promise.all([getTrialBalance(period), listAccounts()]);
  const activityRows = tb.rows.filter(hasPeriodActivity);
  const ledgerRowCodes = new Set(activityRows.map((row) => row.code));
  const seenAccountCodes = new Set<string>();
  const ledgerAccounts = accounts.filter((account) => {
    if (!ledgerRowCodes.has(account.code) || seenAccountCodes.has(account.code)) return false;
    seenAccountCodes.add(account.code);
    return true;
  });
  const requestedCode = (first(sp.account) ?? '').trim();
  const selectedAccount = ledgerAccounts.find((account) => account.code === requestedCode);
  const selectedAccountCode = selectedAccount?.code;

  const visibleRows = activityRows.filter(
    (row) => !selectedAccountCode || row.code === selectedAccountCode,
  );
  const visibleTotals = totalsForRows(visibleRows);
  const periodAccountCount = activityRows.length;
  const detailAccountCode = selectedAccountCode;
  const detailAccountCodes =
    view === 'detail'
      ? detailAccountCode
        ? [detailAccountCode]
        : ledgerAccounts.map((account) => account.code)
      : [];
  const detailLedgers = (
    await Promise.all(
      detailAccountCodes.map((accountCode) => getAccountLedger(accountCode, period)),
    )
  ).filter((ledger): ledger is AccountLedger => ledger !== null);

  const tabItems: readonly { readonly key: LedgerView; readonly label: string }[] = [
    { key: 'balances', label: '科目余额' },
    { key: 'detail', label: '明细账' },
    { key: 'check', label: '试算' },
  ];

  return (
    <div className={`wb-scene wb-stack wb-stack--lg ${styles.ledgerStack}`}>
      <div className={styles.summaryBar} aria-label="账簿概览">
        <span>
          <span className={styles.summaryLabel}>会计期间</span>
          <span className={styles.summaryValue}>
            <PeriodPickerButton
              period={period}
              currentPeriod={currentPeriod}
              view={view}
              account={detailAccountCode}
            />
          </span>
        </span>
        <span>
          <span className={styles.summaryLabel}>有发生额科目</span>
          <span className={styles.summaryValue}>{periodAccountCount}</span>
        </span>
        <span>
          <span className={styles.summaryLabel}>本期发生额</span>
          <span className={styles.summaryValue}>{formatMoney(tb.totals.periodDebit)}</span>
        </span>
        <span>
          <span className={styles.summaryLabel}>试算</span>
          <span className={styles.trialStatuses}>
            <TrialStatus label="期初" balanced={tb.balanced.opening} />
            <TrialStatus label="本期" balanced={tb.balanced.period} />
            <TrialStatus label="期末" balanced={tb.balanced.closing} />
          </span>
        </span>
      </div>

      <div className={styles.navBar}>
        <div className="wb-segmented" role="tablist" aria-label="账簿查询视图">
          {tabItems.map((item) => (
            <Link
              key={item.key}
              role="tab"
              aria-selected={view === item.key}
              className={`wb-segmented__item${view === item.key ? ' wb-segmented__item--active' : ''}`}
              href={ledgerHref({
                view: item.key,
                account: selectedAccountCode,
                period,
              })}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <LedgerControls
          accounts={ledgerAccounts}
          selectedAccountCode={selectedAccountCode}
          view={view}
          period={period}
          currentPeriod={currentPeriod}
        />
      </div>

      {view === 'balances' ? (
        <section className={styles.panel} aria-label="科目余额">
          {visibleRows.length === 0 ? (
            <EmptyState title="没有匹配科目" desc="调整科目或会计期间后再查看。" />
          ) : (
            <div className="wb-table-wrap">
              <table className={`wb-table ${styles.ledgerTable}`}>
                <thead>
                  <tr>
                    <th className="wb-table__th">科目</th>
                    <th className="wb-table__th wb-table__cell--end">期初借</th>
                    <th className="wb-table__th wb-table__cell--end">期初贷</th>
                    <th className="wb-table__th wb-table__cell--end">本期借</th>
                    <th className="wb-table__th wb-table__cell--end">本期贷</th>
                    <th className="wb-table__th wb-table__cell--end">期末借</th>
                    <th className="wb-table__th wb-table__cell--end">期末贷</th>
                    <th className="wb-table__th wb-table__cell--end">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.code} className="wb-table__row">
                      <td>
                        <AccountDetailLink account={row} period={period} />
                      </td>
                      <td className="wb-table__cell--end wb-mono">{cell(row.openingDebit)}</td>
                      <td className="wb-table__cell--end wb-mono">{cell(row.openingCredit)}</td>
                      <td className="wb-table__cell--end wb-mono">{cell(row.periodDebit)}</td>
                      <td className="wb-table__cell--end wb-mono">{cell(row.periodCredit)}</td>
                      <td className="wb-table__cell--end wb-mono">{cell(row.closingDebit)}</td>
                      <td className="wb-table__cell--end wb-mono">{cell(row.closingCredit)}</td>
                      <td className="wb-table__cell--end">
                        <Link
                          className="mt-btn mt-btn--ghost mt-btn--sm"
                          href={ledgerHref({
                            view: 'detail',
                            account: row.code,
                            period,
                          })}
                        >
                          明细
                        </Link>
                      </td>
                    </tr>
                  ))}
                  <tr className="wb-table__row">
                    <td>合计</td>
                    <td className="wb-table__cell--end wb-mono">
                      {formatMoney(visibleTotals.openingDebit)}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {formatMoney(visibleTotals.openingCredit)}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {formatMoney(visibleTotals.periodDebit)}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {formatMoney(visibleTotals.periodCredit)}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {formatMoney(visibleTotals.closingDebit)}
                    </td>
                    <td className="wb-table__cell--end wb-mono">
                      {formatMoney(visibleTotals.closingCredit)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === 'detail' ? (
        <section className={styles.panel} aria-label="明细账">
          {detailLedgers.length > 0 ? (
            detailAccountCode ? (
              <DetailLedgerTable ledger={detailLedgers[0]} />
            ) : (
              <AllDetailLedgerTable ledgers={detailLedgers} period={period} />
            )
          ) : (
            <EmptyState title="暂无明细" desc="当前期间没有发生额科目。" />
          )}
        </section>
      ) : null}

      {view === 'check' ? (
        <section className={styles.panel} aria-label="试算表">
          <TrialBalanceTable rows={visibleRows} totals={visibleTotals} period={period} />
        </section>
      ) : null}
    </div>
  );
}
