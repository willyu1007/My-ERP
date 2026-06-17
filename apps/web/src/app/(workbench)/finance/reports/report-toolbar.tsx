'use client';

import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';
import { reportsToCsv } from '@/lib/finance/report-export';
import type { ResolvedRange } from '@/lib/finance/report-range';
import styles from './reports.module.css';

/**
 * Report export actions (T-006 M3d): 导出 Excel (combined CSV, UTF-8 BOM so Excel
 * shows Chinese) and 打印 / 导出 PDF (the bare /print/reports archival view).
 */
export function ReportToolbar({
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
  function exportCsv(): void {
    const csv = reportsToCsv(range.label, bs, income, cashflow);
    const bom = String.fromCharCode(0xfeff); // so Excel reads the UTF-8 cells (Chinese) correctly
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `财务报表-${range.label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const printHref = `/print/reports?from=${range.from}&to=${range.to}&label=${encodeURIComponent(
    range.label,
  )}`;

  return (
    <div className={styles.toolbar}>
      <button type="button" className="mt-btn mt-btn--secondary mt-btn--sm" onClick={exportCsv}>
        导出 Excel
      </button>
      <a className="mt-btn mt-btn--ghost mt-btn--sm" href={printHref} target="_blank" rel="noopener">
        打印 / 导出 PDF
      </a>
    </div>
  );
}
