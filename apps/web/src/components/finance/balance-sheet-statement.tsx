import type { BalanceSheet, ReportLine } from '@my-erp/api-client';
import { formatMoney } from '@/lib/finance/format';

type BalanceSheetRowKind = 'subsection' | 'detail' | 'subtotal' | 'grandTotal' | 'blank';

interface BalanceSheetRow {
  readonly key: string;
  readonly label: string;
  readonly kind: BalanceSheetRowKind;
  readonly amount?: string;
}

export interface BalanceSheetStatementClasses {
  readonly root?: string;
  readonly title?: string;
  readonly meta?: string;
  readonly metaUnit?: string;
  readonly table?: string;
  readonly row?: string;
  readonly sideHeaderRow?: string;
  readonly sideHeader?: string;
  readonly rightSideHeader?: string;
  readonly headerCell?: string;
  readonly amountHeaderColumn?: string;
  readonly label?: string;
  readonly projectColumn?: string;
  readonly rightProjectColumn?: string;
  readonly amountColumn?: string;
  readonly subsectionRow?: string;
  readonly detailRow?: string;
  readonly subtotalRow?: string;
  readonly grandTotalRow?: string;
  readonly blankRow?: string;
}

const cell = (amount: string | undefined): string =>
  !amount || amount === '0.00' ? '' : formatMoney(amount);

function cx(...values: readonly (false | null | string | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

function lineMap(lines: readonly ReportLine[]): ReadonlyMap<string, ReportLine> {
  return new Map(lines.map((line) => [line.key, line]));
}

function lineRow(
  lines: ReadonlyMap<string, ReportLine>,
  key: string,
  kind: BalanceSheetRowKind,
  fallbackLabel?: string,
): BalanceSheetRow {
  const line = lines.get(key);
  return {
    key,
    kind,
    label: fallbackLabel ?? line?.label ?? key,
    amount: line?.amount,
  };
}

function blankRow(key: string): BalanceSheetRow {
  return { key, label: '', kind: 'blank' };
}

function assetRows(bs: BalanceSheet): readonly BalanceSheetRow[] {
  const lines = lineMap(bs.lines);
  return [
    { key: 'current_assets_section', label: '流动资产', kind: 'subsection' },
    lineRow(lines, 'cash', 'detail', '货币资金'),
    lineRow(lines, 'short_term_investments', 'detail', '短期投资'),
    lineRow(lines, 'notes_receivable', 'detail', '应收票据'),
    lineRow(lines, 'ar', 'detail', '应收账款'),
    lineRow(lines, 'prepayments', 'detail', '预付账款'),
    lineRow(lines, 'dividends_receivable', 'detail', '应收股利'),
    lineRow(lines, 'interest_receivable', 'detail', '应收利息'),
    lineRow(lines, 'other_receivables', 'detail', '其他应收款'),
    lineRow(lines, 'inventory', 'detail', '存货'),
    lineRow(lines, 'inventory_raw_materials', 'detail', '其中：原材料'),
    lineRow(lines, 'inventory_work_in_process', 'detail', '在产品'),
    lineRow(lines, 'inventory_finished_goods', 'detail', '库存商品'),
    lineRow(lines, 'inventory_turnover_materials', 'detail', '周转材料'),
    lineRow(lines, 'other_current_assets', 'detail', '其他流动资产'),
    lineRow(lines, 'current_assets', 'subtotal', '流动资产合计'),
    { key: 'noncurrent_assets_section', label: '非流动资产', kind: 'subsection' },
    lineRow(lines, 'long_term_bond_investments', 'detail', '长期债券投资'),
    lineRow(lines, 'long_term_equity_investments', 'detail', '长期股权投资'),
    lineRow(lines, 'fixed_assets_original', 'detail', '固定资产原价'),
    lineRow(lines, 'accumulated_depreciation', 'detail', '减：累计折旧'),
    lineRow(lines, 'fixed_assets', 'detail', '固定资产'),
    lineRow(lines, 'construction_in_progress', 'detail', '在建工程'),
    lineRow(lines, 'engineering_materials', 'detail', '工程物资'),
    lineRow(lines, 'fixed_assets_disposal', 'detail', '固定资产清理'),
    lineRow(lines, 'productive_biological_assets', 'detail', '生产性生物资产'),
    lineRow(lines, 'intangible_assets', 'detail', '无形资产'),
    lineRow(lines, 'development_expenditure', 'detail', '开发支出'),
    lineRow(lines, 'long_term_deferred_expenses', 'detail', '长期待摊费用'),
    lineRow(lines, 'other_noncurrent_assets', 'detail', '其他非流动资产'),
    lineRow(lines, 'noncurrent_assets', 'subtotal', '非流动资产合计'),
    lineRow(lines, 'total_assets', 'grandTotal', '资产总计'),
  ];
}

function liabilityEquityRows(bs: BalanceSheet): readonly BalanceSheetRow[] {
  const lines = lineMap(bs.lines);
  return [
    { key: 'current_liabilities_section', label: '流动负债', kind: 'subsection' },
    lineRow(lines, 'short_term_borrowings', 'detail', '短期借款'),
    lineRow(lines, 'notes_payable', 'detail', '应付票据'),
    lineRow(lines, 'ap', 'detail', '应付账款'),
    lineRow(lines, 'advances_from_customers', 'detail', '预收账款'),
    lineRow(lines, 'payroll_payable', 'detail', '应付职工薪酬'),
    lineRow(lines, 'taxes', 'detail', '应交税费'),
    lineRow(lines, 'interest_payable', 'detail', '应付利息'),
    lineRow(lines, 'profit_payable', 'detail', '应付利润'),
    lineRow(lines, 'other_payables', 'detail', '其他应付款'),
    lineRow(lines, 'other_current_liabilities', 'detail', '其他流动负债'),
    lineRow(lines, 'current_liabilities', 'subtotal', '流动负债合计'),
    { key: 'noncurrent_liabilities_section', label: '非流动负债', kind: 'subsection' },
    lineRow(lines, 'long_term_borrowings', 'detail', '长期借款'),
    lineRow(lines, 'long_term_payables', 'detail', '长期应付款'),
    lineRow(lines, 'deferred_income', 'detail', '递延收益'),
    lineRow(lines, 'other_noncurrent_liabilities', 'detail', '其他非流动负债'),
    lineRow(lines, 'noncurrent_liabilities', 'subtotal', '非流动负债合计'),
    lineRow(lines, 'total_liabilities', 'subtotal', '负债合计'),
    { key: 'equity_section', label: '所有者权益', kind: 'subsection' },
    lineRow(lines, 'paid_in_capital', 'detail', '实收资本（或股本）'),
    lineRow(lines, 'capital_reserve', 'detail', '资本公积'),
    lineRow(lines, 'surplus_reserve', 'detail', '盈余公积'),
    lineRow(lines, 'retained_earnings', 'detail', '未分配利润'),
    lineRow(lines, 'total_equity', 'subtotal', '所有者权益合计'),
    lineRow(lines, 'total_liabilities_equity', 'grandTotal', '负债和所有者权益总计'),
  ];
}

function rowClass(
  kind: BalanceSheetRowKind,
  classes: BalanceSheetStatementClasses,
): string | undefined {
  if (kind === 'subsection') return classes.subsectionRow;
  if (kind === 'detail') return classes.detailRow;
  if (kind === 'subtotal') return classes.subtotalRow;
  if (kind === 'blank') return classes.blankRow;
  return classes.grandTotalRow;
}

function pairedRows(bs: BalanceSheet) {
  const [left, right] = alignGrandTotals(assetRows(bs), liabilityEquityRows(bs));
  const length = Math.max(left.length, right.length);

  return Array.from({ length }, (_, index) => ({
    key: `${left[index]?.key ?? 'blank'}-${right[index]?.key ?? 'blank'}`,
    left: left[index] ?? blankRow(`left_blank_${index}`),
    right: right[index] ?? blankRow(`right_blank_${index}`),
  }));
}

function alignGrandTotals(
  left: readonly BalanceSheetRow[],
  right: readonly BalanceSheetRow[],
): readonly [readonly BalanceSheetRow[], readonly BalanceSheetRow[]] {
  const maxLength = Math.max(left.length, right.length);
  return [
    padBeforeGrandTotal(left, maxLength, 'left'),
    padBeforeGrandTotal(right, maxLength, 'right'),
  ];
}

function padBeforeGrandTotal(
  rows: readonly BalanceSheetRow[],
  targetLength: number,
  side: 'left' | 'right',
): readonly BalanceSheetRow[] {
  const last = rows[rows.length - 1];
  const blankCount = Math.max(0, targetLength - rows.length);
  if (last?.kind !== 'grandTotal' || blankCount === 0) return rows;
  const body = rows.slice(0, -1);
  return [
    ...body,
    ...Array.from({ length: blankCount }, (_, index) =>
      blankRow(`${side}_grand_total_spacer_${index}`),
    ),
    last,
  ];
}

function SideCells({
  row,
  right,
  classes,
}: {
  readonly row: BalanceSheetRow;
  readonly right?: boolean;
  readonly classes: BalanceSheetStatementClasses;
}) {
  const kindClass = rowClass(row.kind, classes);

  return (
    <>
      <td
        className={cx(
          classes.label,
          classes.projectColumn,
          right && classes.rightProjectColumn,
          kindClass,
        )}
      >
        {row.label}
      </td>
      <td className={cx(classes.amountColumn, kindClass)}>{cell(row.amount)}</td>
    </>
  );
}

export function BalanceSheetStatement({
  bs,
  classes = {},
  tableWrapClassName,
}: {
  readonly bs: BalanceSheet;
  readonly classes?: BalanceSheetStatementClasses;
  readonly tableWrapClassName?: string;
}) {
  const table = (
    <table className={classes.table}>
      <thead>
        <tr className={classes.sideHeaderRow}>
          <th colSpan={2} className={classes.sideHeader}>
            资产
          </th>
          <th colSpan={2} className={cx(classes.sideHeader, classes.rightSideHeader)}>
            负债和所有者权益
          </th>
        </tr>
        <tr>
          <th className={cx(classes.headerCell, classes.projectColumn)}>项目</th>
          <th
            className={cx(classes.headerCell, classes.amountHeaderColumn ?? classes.amountColumn)}
          >
            期末余额
          </th>
          <th className={cx(classes.headerCell, classes.projectColumn, classes.rightProjectColumn)}>
            项目
          </th>
          <th
            className={cx(classes.headerCell, classes.amountHeaderColumn ?? classes.amountColumn)}
          >
            期末余额
          </th>
        </tr>
      </thead>
      <tbody>
        {pairedRows(bs).map((row) => (
          <tr key={row.key} className={classes.row}>
            <SideCells row={row.left} classes={classes} />
            <SideCells row={row.right} right classes={classes} />
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <section className={classes.root}>
      <h2 className={classes.title}>资产负债表</h2>
      <p className={classes.meta}>
        <span>截至 {bs.asOf}</span>
        <span className={classes.metaUnit}>单位：元</span>
      </p>
      {tableWrapClassName ? <div className={tableWrapClassName}>{table}</div> : table}
    </section>
  );
}
