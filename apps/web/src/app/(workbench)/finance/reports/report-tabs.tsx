'use client';

import { useState } from 'react';
import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';
import type { ResolvedRange } from '@/lib/finance/report-range';
import { ReportToolbar } from './report-toolbar';
import styles from './reports.module.css';
import { BalanceSheetView, CashFlowView, IncomeStatementView } from './statement-views';

type ReportTabKey = 'bs' | 'is' | 'cf';

const REPORT_TABS: readonly { readonly key: ReportTabKey; readonly label: string }[] = [
  { key: 'bs', label: '资产负债表' },
  { key: 'is', label: '利润表' },
  { key: 'cf', label: '现金流量表' },
];

function ReportIssues({
  bs,
  cashflow,
}: {
  readonly bs: BalanceSheet;
  readonly cashflow: CashFlowStatement;
}) {
  const issues = [
    bs.balanced ? null : '资产负债表不平',
    cashflow.tied ? null : '现金流量表勾稽不平',
  ].filter((issue): issue is string => issue !== null);

  if (issues.length === 0) return null;

  return (
    <div className={styles.reportIssues} aria-label="报表异常提示">
      {issues.map((issue) => (
        <span key={issue} className={styles.reportIssue}>
          <span className={styles.reportIssueDot} aria-hidden="true" />
          <span>{issue}</span>
        </span>
      ))}
    </div>
  );
}

export function ReportTabs({
  range,
  bs,
  income,
  cashflow,
}: {
  readonly range: ResolvedRange;
  readonly bs: BalanceSheet;
  readonly income: IncomeStatement;
  readonly cashflow: CashFlowStatement;
}) {
  const [active, setActive] = useState<ReportTabKey>('bs');

  return (
    <>
      <div className={styles.reportHeader}>
        <div className={styles.reportTabCluster}>
          <div className="wb-segmented" role="tablist" aria-label="财务报表类型">
            {REPORT_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active === item.key}
                className={`wb-segmented__item${active === item.key ? ' wb-segmented__item--active' : ''}`}
                onClick={() => setActive(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ReportIssues bs={bs} cashflow={cashflow} />
        </div>
        <ReportToolbar range={range} bs={bs} income={income} cashflow={cashflow} />
      </div>

      <div role="tabpanel">
        {active === 'bs' ? <BalanceSheetView bs={bs} /> : null}
        {active === 'is' ? <IncomeStatementView is={income} /> : null}
        {active === 'cf' ? <CashFlowView cf={cashflow} /> : null}
      </div>
    </>
  );
}
