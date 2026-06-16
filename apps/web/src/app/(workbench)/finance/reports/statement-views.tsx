import { StatusBadge } from '@my-erp/ui';
import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
  ReportLine,
} from '@my-erp/api-client';
import { formatMoney } from '@/lib/finance/format';
import styles from './reports.module.css';

/** Blank out a zero amount so the statements read like paper registers. */
const cell = (amount: string): string => (amount === '0.00' ? '' : formatMoney(amount));

const ACTIVITY_LABEL: Record<string, string> = {
  operating: '一、经营活动产生的现金流量',
  investing: '二、投资活动产生的现金流量',
  financing: '三、筹资活动产生的现金流量',
};

function LineRows({ lines }: { readonly lines: readonly ReportLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <tr key={l.key} className={`wb-table__row ${l.level === 0 ? styles.lvl0 : styles.lvl1}`}>
          <td className={styles.label}>{l.label}</td>
          <td className="wb-table__cell--end wb-mono">{cell(l.amount)}</td>
        </tr>
      ))}
    </>
  );
}

export function BalanceSheetView({ bs }: { readonly bs: BalanceSheet }) {
  return (
    <div className="wb-stack wb-stack--sm">
      <div className="wb-row wb-row--wrap">
        <StatusBadge
          tone={bs.balanced ? 'success' : 'danger'}
          dot
          label={`资产 = 负债 + 所有者权益 ${bs.balanced ? '平衡' : '不平'}`}
        />
        <span className="wb-muted">截至 {bs.asOf}</span>
      </div>
      <div className="wb-table-wrap">
        <table className="wb-table">
          <thead>
            <tr>
              <th className="wb-table__th">项目</th>
              <th className="wb-table__th wb-table__cell--end">期末余额</th>
            </tr>
          </thead>
          <tbody>
            <LineRows lines={bs.lines} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IncomeStatementView({ is }: { readonly is: IncomeStatement }) {
  return (
    <div className="wb-stack wb-stack--sm">
      <div className="wb-row wb-row--wrap">
        <StatusBadge tone="info" dot label={`净利润 ${formatMoney(is.netProfit)}`} />
        <span className="wb-muted">
          {is.from} 至 {is.to}
        </span>
      </div>
      <div className="wb-table-wrap">
        <table className="wb-table">
          <thead>
            <tr>
              <th className="wb-table__th">项目</th>
              <th className="wb-table__th wb-table__cell--end">本期金额</th>
            </tr>
          </thead>
          <tbody>
            <LineRows lines={is.lines} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CashFlowView({ cf }: { readonly cf: CashFlowStatement }) {
  return (
    <div className="wb-stack wb-stack--sm">
      <div className="wb-row wb-row--wrap">
        <StatusBadge
          tone={cf.tied ? 'success' : 'danger'}
          dot
          label={`勾稽 ${cf.tied ? '平衡' : '不平'}`}
        />
        <StatusBadge tone="info" dot label={`现金净增加额 ${formatMoney(cf.netCashFlow)}`} />
        <span className="wb-muted">
          {cf.from} 至 {cf.to}
        </span>
      </div>
      <div className="wb-table-wrap">
        <table className="wb-table">
          <thead>
            <tr>
              <th className="wb-table__th">项目</th>
              <th className="wb-table__th wb-table__cell--end">本期金额</th>
            </tr>
          </thead>
          <tbody>
            {cf.activities.map((act) => (
              <ActivityRows key={act.activity ?? ''} act={act} />
            ))}
            <tr className={`wb-table__row ${styles.total}`}>
              <td>现金及现金等价物净增加额</td>
              <td className="wb-table__cell--end wb-mono">{formatMoney(cf.netCashFlow)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityRows({ act }: { readonly act: CashFlowStatement['activities'][number] }) {
  return (
    <>
      <tr className={`wb-table__row ${styles.lvl0}`}>
        <td className={styles.label}>{ACTIVITY_LABEL[act.activity ?? ''] ?? act.activity}</td>
        <td className="wb-table__cell--end wb-mono">{cell(act.subtotal ?? '0.00')}</td>
      </tr>
      {(act.lines ?? []).map((l) => (
        <tr key={l.code} className={`wb-table__row ${styles.lvl1}`}>
          <td className={styles.label}>{l.name}</td>
          <td className="wb-table__cell--end wb-mono">{cell(l.amount ?? '0.00')}</td>
        </tr>
      ))}
    </>
  );
}
