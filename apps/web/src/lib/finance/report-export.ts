/**
 * Report export (T-006 M3d) — pure CSV builders for the statutory statements.
 * Excel opens CSV directly; the client adds a UTF-8 BOM on download so Chinese
 * renders. PDF/print is handled by the dedicated print route, not here.
 */
import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';

/** RFC-4180-ish quoting; CRLF line ends so Excel parses cleanly. */
function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

const ACTIVITY_LABEL: Record<string, string> = {
  operating: '一、经营活动产生的现金流量',
  investing: '二、投资活动产生的现金流量',
  financing: '三、筹资活动产生的现金流量',
};

/** Combined CSV of the three statements as labelled sections (one file, Excel-friendly). */
export function reportsToCsv(
  label: string,
  bs: BalanceSheet,
  is: IncomeStatement,
  cf: CashFlowStatement,
): string {
  const rows: string[][] = [['财务报表', label], []];

  rows.push([`资产负债表（截至 ${bs.asOf}）`], ['项目', '期末余额']);
  for (const l of bs.lines) rows.push([l.label, l.amount]);
  rows.push([]);

  rows.push([`利润表（${is.from} 至 ${is.to}）`], ['项目', '本期金额']);
  for (const l of is.lines) rows.push([l.label, l.amount]);
  rows.push([]);

  rows.push([`现金流量表（${cf.from} 至 ${cf.to}）`], ['项目', '本期金额']);
  for (const act of cf.activities) {
    rows.push([ACTIVITY_LABEL[act.activity ?? ''] ?? act.activity ?? '', act.subtotal ?? '0.00']);
    for (const l of act.lines ?? []) rows.push([l.name ?? '', l.amount ?? '0.00']);
  }
  rows.push(['现金及现金等价物净增加额', cf.netCashFlow]);

  return toCsv(rows);
}
