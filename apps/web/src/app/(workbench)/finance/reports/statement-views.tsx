import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';
import { BalanceSheetStatement } from '@/components/finance/balance-sheet-statement';
import { StatutoryStatement } from '@/components/finance/statutory-statement';
import {
  buildCashFlowStatementRows,
  buildIncomeStatementRows,
} from '@/lib/finance/statutory-statements';
import styles from './reports.module.css';

const balanceSheetClasses = {
  root: styles.statement,
  title: styles.statementTitle,
  meta: styles.statementMeta,
  metaUnit: styles.statementMetaUnit,
  table: `wb-table ${styles.statementTable} ${styles.balanceSheetTable}`,
  row: 'wb-table__row',
  sideHeaderRow: styles.balanceSideHeaderRow,
  sideHeader: styles.balanceSideHeader,
  rightSideHeader: styles.balanceRightSideHeader,
  headerCell: 'wb-table__th',
  label: styles.label,
  projectColumn: styles.projectColumn,
  rightProjectColumn: styles.balanceRightProjectColumn,
  amountHeaderColumn: `wb-table__cell--end ${styles.amountColumn}`,
  amountColumn: `wb-table__cell--end wb-mono ${styles.amountColumn}`,
  subsectionRow: styles.balanceSubsectionRow,
  detailRow: styles.balanceDetailRow,
  subtotalRow: styles.balanceSubtotalRow,
  grandTotalRow: styles.balanceGrandTotalRow,
  blankRow: styles.balanceBlankRow,
};

const statutoryStatementClasses = {
  root: styles.statement,
  title: styles.statementTitle,
  meta: styles.statementMeta,
  metaUnit: styles.statementMetaUnit,
  table: `wb-table ${styles.statementTable} ${styles.statutoryTable}`,
  row: 'wb-table__row',
  headerCell: 'wb-table__th',
  label: styles.label,
  projectColumn: styles.projectColumn,
  lineNoColumn: styles.lineNoColumn,
  amountHeaderColumn: `wb-table__cell--end ${styles.amountColumn}`,
  amountColumn: `wb-table__cell--end wb-mono ${styles.amountColumn}`,
  sectionRow: styles.statutorySectionRow,
  primaryRow: styles.statutoryPrimaryRow,
  detailRow: styles.statutoryDetailRow,
  subdetailRow: styles.statutorySubdetailRow,
  subtotalRow: styles.statutorySubtotalRow,
  grandTotalRow: styles.statutoryGrandTotalRow,
  cashFlowDetailRow: styles.statutoryCashFlowDetailRow,
  cashFlowSubtotalRow: styles.statutoryCashFlowSubtotalRow,
};

export function BalanceSheetView({ bs }: { readonly bs: BalanceSheet }) {
  return (
    <BalanceSheetStatement
      bs={bs}
      classes={balanceSheetClasses}
      tableWrapClassName="wb-table-wrap"
    />
  );
}

export function IncomeStatementView({ is }: { readonly is: IncomeStatement }) {
  return (
    <StatutoryStatement
      title="利润表"
      meta={`${is.from} 至 ${is.to}`}
      rows={buildIncomeStatementRows(is)}
      classes={statutoryStatementClasses}
      tableWrapClassName="wb-table-wrap"
    />
  );
}

export function CashFlowView({ cf }: { readonly cf: CashFlowStatement }) {
  return (
    <StatutoryStatement
      title="现金流量表"
      meta={`${cf.from} 至 ${cf.to}`}
      rows={buildCashFlowStatementRows(cf)}
      classes={statutoryStatementClasses}
      tableWrapClassName="wb-table-wrap"
    />
  );
}
