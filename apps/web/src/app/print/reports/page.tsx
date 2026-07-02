import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';
import {
  getBalanceSheet,
  getCashFlowStatement,
  getIncomeStatement,
} from '@/lib/finance/data-source';
import { BalanceSheetStatement } from '@/components/finance/balance-sheet-statement';
import { StatutoryStatement } from '@/components/finance/statutory-statement';
import {
  buildCashFlowStatementRows,
  buildIncomeStatementRows,
} from '@/lib/finance/statutory-statements';
import { PrintButton } from './print-button';
import styles from './print.module.css';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const balanceSheetClasses = {
  root: styles.stmt,
  title: styles.stmtTitle,
  meta: styles.stmtMeta,
  metaUnit: styles.stmtMetaUnit,
  table: `${styles.table} ${styles.balanceSheetTable}`,
  sideHeaderRow: styles.balanceSideHeaderRow,
  sideHeader: styles.balanceSideHeader,
  rightSideHeader: styles.balanceRightSideHeader,
  label: styles.label,
  projectColumn: styles.projectColumn,
  rightProjectColumn: styles.balanceRightProjectColumn,
  amountColumn: styles.amt,
  subsectionRow: styles.balanceSubsectionRow,
  detailRow: styles.balanceDetailRow,
  subtotalRow: styles.balanceSubtotalRow,
  grandTotalRow: styles.balanceGrandTotalRow,
  blankRow: styles.balanceBlankRow,
};

const statutoryStatementClasses = {
  root: styles.stmt,
  title: styles.stmtTitle,
  meta: styles.stmtMeta,
  metaUnit: styles.stmtMetaUnit,
  table: `${styles.table} ${styles.statutoryTable}`,
  label: styles.label,
  projectColumn: styles.projectColumn,
  lineNoColumn: styles.lineNoColumn,
  amountColumn: styles.amt,
  sectionRow: styles.statutorySectionRow,
  primaryRow: styles.statutoryPrimaryRow,
  detailRow: styles.statutoryDetailRow,
  subdetailRow: styles.statutorySubdetailRow,
  subtotalRow: styles.statutorySubtotalRow,
  grandTotalRow: styles.statutoryGrandTotalRow,
  cashFlowDetailRow: styles.statutoryCashFlowDetailRow,
  cashFlowSubtotalRow: styles.statutoryCashFlowSubtotalRow,
};

/**
 * Print/PDF view of the statutory statements (T-006 M3d) — the 打印归档 surface.
 * Bare layout (no workbench chrome): all three tables stacked for a clean archive.
 * Opened from /finance/reports with from/to/label; 打印 → browser print or save-as-PDF.
 */
export default async function ReportsPrintPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const from = first(sp.from);
  const to = first(sp.to);
  const label = first(sp.label) ?? '';

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return (
      <div className={styles.page}>
        <p className={styles.notice}>缺少有效的报表区间参数（from / to）。</p>
      </div>
    );
  }

  const [bs, income, cashflow] = (await Promise.all([
    getBalanceSheet(to),
    getIncomeStatement(from, to),
    getCashFlowStatement(from, to),
  ])) as [BalanceSheet | null, IncomeStatement | null, CashFlowStatement | null];

  if (!bs || !income || !cashflow) {
    return (
      <div className={styles.page}>
        <p className={styles.notice}>未连接后端，无法生成报表（报表由后端从账务派生）。</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <PrintButton />
      </div>

      <h1 className={styles.docTitle}>财务报表</h1>
      <p className={styles.docMeta}>{label || `${from} 至 ${to}`}</p>

      <BalanceSheetStatement bs={bs} classes={balanceSheetClasses} />

      <StatutoryStatement
        title="利润表"
        meta={`${income.from} 至 ${income.to}`}
        rows={buildIncomeStatementRows(income)}
        classes={statutoryStatementClasses}
      />

      <StatutoryStatement
        title="现金流量表"
        meta={`${cashflow.from} 至 ${cashflow.to}`}
        rows={buildCashFlowStatementRows(cashflow)}
        classes={statutoryStatementClasses}
      />
    </div>
  );
}
