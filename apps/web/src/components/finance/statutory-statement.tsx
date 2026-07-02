import type {
  StatutoryStatementRow,
  StatutoryStatementRowKind,
} from '@/lib/finance/statutory-statements';
import { formatMoney } from '@/lib/finance/format';

export interface StatutoryStatementClasses {
  readonly root?: string;
  readonly title?: string;
  readonly meta?: string;
  readonly metaUnit?: string;
  readonly table?: string;
  readonly row?: string;
  readonly headerCell?: string;
  readonly label?: string;
  readonly projectColumn?: string;
  readonly lineNoColumn?: string;
  readonly amountHeaderColumn?: string;
  readonly amountColumn?: string;
  readonly sectionRow?: string;
  readonly primaryRow?: string;
  readonly detailRow?: string;
  readonly subdetailRow?: string;
  readonly subtotalRow?: string;
  readonly grandTotalRow?: string;
  readonly cashFlowDetailRow?: string;
  readonly cashFlowSubtotalRow?: string;
}

function cx(...values: readonly (false | null | string | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

function cell(amount: string | undefined): string {
  return !amount || amount === '0.00' ? '' : formatMoney(amount);
}

function rowClass(
  kind: StatutoryStatementRowKind,
  classes: StatutoryStatementClasses,
): string | undefined {
  if (kind === 'section') return classes.sectionRow;
  if (kind === 'primary') return classes.primaryRow;
  if (kind === 'detail') return classes.detailRow;
  if (kind === 'subdetail') return classes.subdetailRow;
  if (kind === 'subtotal') return classes.subtotalRow;
  if (kind === 'cashFlowDetail') return classes.cashFlowDetailRow;
  if (kind === 'cashFlowSubtotal') return classes.cashFlowSubtotalRow;
  return classes.grandTotalRow;
}

export function StatutoryStatement({
  title,
  meta,
  amountHeader = '本期金额',
  rows,
  classes = {},
  tableWrapClassName,
}: {
  readonly title: string;
  readonly meta: string;
  readonly amountHeader?: string;
  readonly rows: readonly StatutoryStatementRow[];
  readonly classes?: StatutoryStatementClasses;
  readonly tableWrapClassName?: string;
}) {
  const table = (
    <table className={classes.table}>
      <thead>
        <tr className={classes.row}>
          <th className={cx(classes.headerCell, classes.projectColumn)}>项目</th>
          <th className={cx(classes.headerCell, classes.lineNoColumn)}>行次</th>
          <th
            className={cx(classes.headerCell, classes.amountHeaderColumn ?? classes.amountColumn)}
          >
            {amountHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const kindClass = rowClass(row.kind, classes);
          return (
            <tr key={row.key} className={classes.row}>
              <td className={cx(classes.label, classes.projectColumn, kindClass)}>{row.label}</td>
              <td className={cx(classes.lineNoColumn, kindClass)}>{row.lineNo ?? ''}</td>
              <td className={cx(classes.amountColumn, kindClass)}>{cell(row.amount)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section className={classes.root}>
      <h2 className={classes.title}>{title}</h2>
      <p className={classes.meta}>
        <span>{meta}</span>
        <span className={classes.metaUnit}>单位：元</span>
      </p>
      {tableWrapClassName ? <div className={tableWrapClassName}>{table}</div> : table}
    </section>
  );
}
