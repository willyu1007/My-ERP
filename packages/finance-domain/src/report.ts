import Decimal from 'decimal.js';
import { computeTrialBalance, type OpeningLine, type PostedLine } from './ledger';
import { isCashAccountCode } from './cash-flow';

/**
 * Statutory report read-model (T-006 M3c) — range-parameterized, derived from
 * POSTED entries (no materialized balances). Pure + exact (Decimal). Mapping is
 * code-first (signed sums + netting). 月/季/年/custom range → BS as-of range end,
 * IS / CF within the range.
 */

/** 'net' = debit − credit (asset/expense side); 'credit' = credit − debit (liability/revenue/equity). */
export type ReportSide = 'net' | 'credit';
export interface ReportTerm {
  /** Account-code prefix (e.g. '1002' also catches its sub-accounts 100201/...). */
  readonly prefix: string;
  readonly side: ReportSide;
  readonly sign: 1 | -1;
}
export interface ReportLineDef {
  readonly key: string;
  readonly label: string;
  readonly level: number;
  readonly terms?: readonly ReportTerm[];
  /** Signed sum of previously-computed lines (subtotals / 净利润). */
  readonly combine?: readonly { readonly line: string; readonly sign: 1 | -1 }[];
  /** Add Σ P&L (credit − debit) — for BS 未分配利润 (the un-结转 profit). */
  readonly includesPnl?: boolean;
}
export interface ReportLine {
  readonly key: string;
  readonly label: string;
  readonly level: number;
  readonly amount: string;
}

export interface ReportAccountAmount {
  readonly code: string;
  readonly category: string;
  readonly debit: string;
  readonly credit: string;
}

const isPnl = (category: string): boolean => category === 'cost' || category === 'profitLoss';
const sideValue = (row: ReportAccountAmount, side: ReportSide): Decimal => {
  const debit = new Decimal(row.debit || 0);
  const credit = new Decimal(row.credit || 0);
  return side === 'credit' ? credit.minus(debit) : debit.minus(credit);
};

function termSum(rows: readonly ReportAccountAmount[], term: ReportTerm): Decimal {
  let total = new Decimal(0);
  for (const r of rows) {
    if (r.code.startsWith(term.prefix)) total = total.plus(sideValue(r, term.side).times(term.sign));
  }
  return total;
}

/** Evaluate report lines in order (combine refers to earlier lines). */
export function evalReport(
  defs: readonly ReportLineDef[],
  rows: readonly ReportAccountAmount[],
): ReportLine[] {
  const pnlNet = rows.reduce(
    (acc, r) => (isPnl(r.category) ? acc.plus(sideValue(r, 'credit')) : acc),
    new Decimal(0),
  );
  const byKey = new Map<string, Decimal>();
  const out: ReportLine[] = [];
  for (const def of defs) {
    let amount = new Decimal(0);
    for (const t of def.terms ?? []) amount = amount.plus(termSum(rows, t));
    for (const c of def.combine ?? []) amount = amount.plus((byKey.get(c.line) ?? new Decimal(0)).times(c.sign));
    if (def.includesPnl) amount = amount.plus(pnlNet);
    byKey.set(def.key, amount);
    out.push({ key: def.key, label: def.label, level: def.level, amount: amount.toFixed(2) });
  }
  return out;
}

/* ---------- Range-aware account amounts ---------- */

function enrich(
  rows: readonly { accountCode: string; debit: string; credit: string }[],
  categoryOf: (code: string) => string,
): ReportAccountAmount[] {
  return rows.map((r) => ({ code: r.accountCode, category: categoryOf(r.accountCode), debit: r.debit, credit: r.credit }));
}

/** Closing balances as-of `to` (date <= to). For the balance sheet. */
export function closingAsOf(
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
  categoryOf: (code: string) => string,
  to: string,
): ReportAccountAmount[] {
  const tb = computeTrialBalance(entries.filter((e) => e.date <= to), openings);
  return enrich(
    tb.rows.map((r) => ({ accountCode: r.accountCode, debit: r.closingDebit, credit: r.closingCredit })),
    categoryOf,
  );
}

/**
 * Period 发生额 within [from, to], EXCLUDING `excludeVoucherIds` (the 结转损益 closing
 * vouchers — their zeroing entries would net out the period's revenue/expense). For
 * the income statement. The balance sheet (a stock statement) keeps closing entries.
 */
export function periodActivity(
  entries: readonly PostedLine[],
  categoryOf: (code: string) => string,
  from: string,
  to: string,
  excludeVoucherIds: ReadonlySet<string> = new Set(),
): ReportAccountAmount[] {
  const tb = computeTrialBalance(
    entries.filter((e) => e.date >= from && e.date <= to && !excludeVoucherIds.has(e.voucherId)),
    [],
  );
  return enrich(
    tb.rows.map((r) => ({ accountCode: r.accountCode, debit: r.periodDebit, credit: r.periodCredit })),
    categoryOf,
  );
}

/* ---------- Templates (《小企业会计准则》, code-first) ---------- */

export const BALANCE_SHEET_TEMPLATE: readonly ReportLineDef[] = [
  { key: 'cash', label: '货币资金', level: 1, terms: [{ prefix: '1001', side: 'net', sign: 1 }, { prefix: '1002', side: 'net', sign: 1 }, { prefix: '1012', side: 'net', sign: 1 }] },
  { key: 'ar', label: '应收账款', level: 1, terms: [{ prefix: '1122', side: 'net', sign: 1 }, { prefix: '1231', side: 'net', sign: 1 }] },
  { key: 'inventory', label: '存货', level: 1, terms: [{ prefix: '1405', side: 'net', sign: 1 }, { prefix: '1401', side: 'net', sign: 1 }] },
  { key: 'current_assets', label: '流动资产合计', level: 0, combine: [{ line: 'cash', sign: 1 }, { line: 'ar', sign: 1 }, { line: 'inventory', sign: 1 }] },
  { key: 'fixed_assets', label: '固定资产', level: 1, terms: [{ prefix: '1601', side: 'net', sign: 1 }, { prefix: '1602', side: 'net', sign: 1 }] },
  { key: 'noncurrent_assets', label: '非流动资产合计', level: 0, combine: [{ line: 'fixed_assets', sign: 1 }] },
  { key: 'total_assets', label: '资产总计', level: 0, combine: [{ line: 'current_assets', sign: 1 }, { line: 'noncurrent_assets', sign: 1 }] },
  { key: 'ap', label: '应付账款', level: 1, terms: [{ prefix: '2202', side: 'credit', sign: 1 }] },
  { key: 'taxes', label: '应交税费', level: 1, terms: [{ prefix: '2221', side: 'credit', sign: 1 }] },
  { key: 'current_liabilities', label: '流动负债合计', level: 0, combine: [{ line: 'ap', sign: 1 }, { line: 'taxes', sign: 1 }] },
  { key: 'total_liabilities', label: '负债合计', level: 0, combine: [{ line: 'current_liabilities', sign: 1 }] },
  { key: 'paid_in_capital', label: '实收资本', level: 1, terms: [{ prefix: '4001', side: 'credit', sign: 1 }] },
  { key: 'retained_earnings', label: '未分配利润', level: 1, terms: [{ prefix: '4103', side: 'credit', sign: 1 }, { prefix: '4104', side: 'credit', sign: 1 }], includesPnl: true },
  { key: 'total_equity', label: '所有者权益合计', level: 0, combine: [{ line: 'paid_in_capital', sign: 1 }, { line: 'retained_earnings', sign: 1 }] },
  { key: 'total_liabilities_equity', label: '负债和所有者权益总计', level: 0, combine: [{ line: 'total_liabilities', sign: 1 }, { line: 'total_equity', sign: 1 }] },
];

export const INCOME_STATEMENT_TEMPLATE: readonly ReportLineDef[] = [
  { key: 'revenue', label: '营业收入', level: 1, terms: [{ prefix: '6001', side: 'credit', sign: 1 }, { prefix: '6051', side: 'credit', sign: 1 }] },
  { key: 'cogs', label: '营业成本', level: 1, terms: [{ prefix: '6401', side: 'net', sign: 1 }, { prefix: '6402', side: 'net', sign: 1 }] },
  { key: 'taxes_surcharges', label: '税金及附加', level: 1, terms: [{ prefix: '6403', side: 'net', sign: 1 }] },
  { key: 'selling', label: '销售费用', level: 1, terms: [{ prefix: '6601', side: 'net', sign: 1 }] },
  { key: 'admin', label: '管理费用', level: 1, terms: [{ prefix: '6602', side: 'net', sign: 1 }] },
  { key: 'finance_exp', label: '财务费用', level: 1, terms: [{ prefix: '6603', side: 'net', sign: 1 }] },
  { key: 'operating_profit', label: '营业利润', level: 0, combine: [{ line: 'revenue', sign: 1 }, { line: 'cogs', sign: -1 }, { line: 'taxes_surcharges', sign: -1 }, { line: 'selling', sign: -1 }, { line: 'admin', sign: -1 }, { line: 'finance_exp', sign: -1 }] },
  { key: 'net_profit', label: '净利润', level: 0, combine: [{ line: 'operating_profit', sign: 1 }] },
];

/* ---------- Statements ---------- */

export interface BalanceSheet {
  readonly asOf: string;
  readonly lines: readonly ReportLine[];
  readonly balanced: boolean;
}
export function balanceSheet(
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
  categoryOf: (code: string) => string,
  to: string,
): BalanceSheet {
  const lines = evalReport(BALANCE_SHEET_TEMPLATE, closingAsOf(entries, openings, categoryOf, to));
  const assets = lines.find((l) => l.key === 'total_assets')?.amount ?? '0';
  const liabEq = lines.find((l) => l.key === 'total_liabilities_equity')?.amount ?? '0';
  return { asOf: to, lines, balanced: new Decimal(assets).equals(new Decimal(liabEq)) };
}

export interface IncomeStatement {
  readonly from: string;
  readonly to: string;
  readonly lines: readonly ReportLine[];
  readonly netProfit: string;
}
export function incomeStatement(
  entries: readonly PostedLine[],
  categoryOf: (code: string) => string,
  from: string,
  to: string,
  excludeVoucherIds: ReadonlySet<string> = new Set(),
): IncomeStatement {
  const lines = evalReport(
    INCOME_STATEMENT_TEMPLATE,
    periodActivity(entries, categoryOf, from, to, excludeVoucherIds),
  );
  return { from, to, lines, netProfit: lines.find((l) => l.key === 'net_profit')?.amount ?? '0.00' };
}

export interface CashFlowItemRef {
  readonly code: string;
  readonly name: string;
  readonly activity: string;
  readonly direction: string;
}
export interface CashFlowStatementLine {
  readonly code: string;
  readonly name: string;
  readonly amount: string;
}
export interface CashFlowActivityGroup {
  readonly activity: string;
  readonly lines: readonly CashFlowStatementLine[];
  readonly subtotal: string;
}
export interface CashFlowStatement {
  readonly from: string;
  readonly to: string;
  readonly activities: readonly CashFlowActivityGroup[];
  readonly netCashFlow: string;
  readonly tied: boolean;
}

const ACTIVITY_ORDER = ['operating', 'investing', 'financing'] as const;

/** Direct-method CF, grouped by CashFlowItem. amount per item = Σ tagged (credit − debit). */
export function cashFlowStatement(
  entries: readonly PostedLine[],
  items: readonly CashFlowItemRef[],
  from: string,
  to: string,
  excludeVoucherIds: ReadonlySet<string> = new Set(),
): CashFlowStatement {
  const byItem = new Map<string, Decimal>();
  let cashChange = new Decimal(0);
  for (const e of entries) {
    if (e.date < from || e.date > to || excludeVoucherIds.has(e.voucherId)) continue;
    const debit = new Decimal(e.debit || 0);
    const credit = new Decimal(e.credit || 0);
    if (isCashAccountCode(e.accountCode)) cashChange = cashChange.plus(debit).minus(credit);
    else if (e.cashFlowItem) byItem.set(e.cashFlowItem, (byItem.get(e.cashFlowItem) ?? new Decimal(0)).plus(credit).minus(debit));
  }
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  let net = new Decimal(0);
  const activities: CashFlowActivityGroup[] = ACTIVITY_ORDER.map((activity) => {
    const lines: CashFlowStatementLine[] = [];
    let subtotal = new Decimal(0);
    for (const [code, amount] of byItem) {
      if ((itemByCode.get(code)?.activity ?? 'operating') !== activity) continue;
      lines.push({ code, name: itemByCode.get(code)?.name ?? code, amount: amount.toFixed(2) });
      subtotal = subtotal.plus(amount);
    }
    net = net.plus(subtotal);
    return { activity, lines, subtotal: subtotal.toFixed(2) };
  });
  return { from, to, activities, netCashFlow: net.toFixed(2), tied: net.equals(cashChange) };
}
