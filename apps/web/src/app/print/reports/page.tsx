import { Fragment } from 'react';
import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
  ReportLine,
} from '@my-erp/api-client';
import {
  getBalanceSheet,
  getCashFlowStatement,
  getIncomeStatement,
} from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';
import { PrintButton } from './print-button';
import styles from './print.module.css';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
        <tr key={l.key} className={l.level === 0 ? styles.lvl0 : styles.lvl1}>
          <td className={styles.label}>{l.label}</td>
          <td className={styles.amt}>{cell(l.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function Statement({
  title,
  meta,
  headRight,
  children,
}: {
  readonly title: string;
  readonly meta: string;
  readonly headRight: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className={styles.stmt}>
      <h2 className={styles.stmtTitle}>{title}</h2>
      <p className={styles.stmtMeta}>{meta}</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>项目</th>
            <th>{headRight}</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

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

      <Statement title="资产负债表" meta={`截至 ${bs.asOf}`} headRight="期末余额">
        <LineRows lines={bs.lines} />
      </Statement>

      <Statement title="利润表" meta={`${income.from} 至 ${income.to}`} headRight="本期金额">
        <LineRows lines={income.lines} />
      </Statement>

      <Statement
        title="现金流量表"
        meta={`${cashflow.from} 至 ${cashflow.to}`}
        headRight="本期金额"
      >
        {cashflow.activities.map((act) => (
          <Fragment key={act.activity ?? ''}>
            <tr className={styles.lvl0}>
              <td className={styles.label}>
                {ACTIVITY_LABEL[act.activity ?? ''] ?? act.activity}
              </td>
              <td className={styles.amt}>{cell(act.subtotal ?? '0.00')}</td>
            </tr>
            {(act.lines ?? []).map((l) => (
              <tr key={`${act.activity}-${l.code}`} className={styles.lvl1}>
                <td className={styles.label}>{l.name}</td>
                <td className={styles.amt}>{cell(l.amount ?? '0.00')}</td>
              </tr>
            ))}
          </Fragment>
        ))}
        <tr className={styles.lvl0}>
          <td className={styles.label}>现金及现金等价物净增加额</td>
          <td className={styles.amt}>{formatMoney(cashflow.netCashFlow)}</td>
        </tr>
      </Statement>
    </div>
  );
}
