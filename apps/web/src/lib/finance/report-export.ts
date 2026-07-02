/**
 * Report export (T-006 M3d) — pure CSV builders for the statutory statements.
 * Excel opens CSV directly; the client adds a UTF-8 BOM on download so Chinese
 * renders. PDF/print is handled by the dedicated print route, not here.
 */
import type { BalanceSheet, CashFlowStatement, IncomeStatement } from '@my-erp/api-client';
import { buildCashFlowStatementRows, buildIncomeStatementRows } from './statutory-statements';

/** RFC-4180-ish quoting; CRLF line ends so Excel parses cleanly. */
function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

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

  rows.push([`利润表（${is.from} 至 ${is.to}）`], ['项目', '行次', '本期金额']);
  for (const l of buildIncomeStatementRows(is))
    rows.push([l.label, l.lineNo ?? '', l.amount ?? '']);
  rows.push([]);

  rows.push([`现金流量表（${cf.from} 至 ${cf.to}）`], ['项目', '行次', '本期金额']);
  for (const l of buildCashFlowStatementRows(cf))
    rows.push([l.label, l.lineNo ?? '', l.amount ?? '']);

  return toCsv(rows);
}
