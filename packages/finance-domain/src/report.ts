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
    if (r.code.startsWith(term.prefix))
      total = total.plus(sideValue(r, term.side).times(term.sign));
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
    for (const c of def.combine ?? [])
      amount = amount.plus((byKey.get(c.line) ?? new Decimal(0)).times(c.sign));
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
  return rows.map((r) => ({
    code: r.accountCode,
    category: categoryOf(r.accountCode),
    debit: r.debit,
    credit: r.credit,
  }));
}

/** Closing balances as-of `to` (date <= to). For the balance sheet. */
export function closingAsOf(
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
  categoryOf: (code: string) => string,
  to: string,
): ReportAccountAmount[] {
  const tb = computeTrialBalance(
    entries.filter((e) => e.date <= to),
    openings,
  );
  return enrich(
    tb.rows.map((r) => ({
      accountCode: r.accountCode,
      debit: r.closingDebit,
      credit: r.closingCredit,
    })),
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
    tb.rows.map((r) => ({
      accountCode: r.accountCode,
      debit: r.periodDebit,
      credit: r.periodCredit,
    })),
    categoryOf,
  );
}

/* ---------- Templates (《小企业会计准则》, code-first) ---------- */

export const BALANCE_SHEET_TEMPLATE: readonly ReportLineDef[] = [
  {
    key: 'cash',
    label: '货币资金',
    level: 1,
    terms: [
      { prefix: '1001', side: 'net', sign: 1 },
      { prefix: '1002', side: 'net', sign: 1 },
      { prefix: '1012', side: 'net', sign: 1 },
    ],
  },
  {
    key: 'short_term_investments',
    label: '短期投资',
    level: 1,
    terms: [{ prefix: '1101', side: 'net', sign: 1 }],
  },
  {
    key: 'notes_receivable',
    label: '应收票据',
    level: 1,
    terms: [{ prefix: '1121', side: 'net', sign: 1 }],
  },
  {
    key: 'ar',
    label: '应收账款',
    level: 1,
    terms: [
      { prefix: '1122', side: 'net', sign: 1 },
      { prefix: '1231', side: 'net', sign: 1 },
    ],
  },
  {
    key: 'prepayments',
    label: '预付账款',
    level: 1,
    terms: [{ prefix: '1123', side: 'net', sign: 1 }],
  },
  {
    key: 'dividends_receivable',
    label: '应收股利',
    level: 1,
    terms: [{ prefix: '1131', side: 'net', sign: 1 }],
  },
  {
    key: 'interest_receivable',
    label: '应收利息',
    level: 1,
    terms: [{ prefix: '1132', side: 'net', sign: 1 }],
  },
  {
    key: 'other_receivables',
    label: '其他应收款',
    level: 1,
    terms: [{ prefix: '1221', side: 'net', sign: 1 }],
  },
  {
    key: 'inventory_raw_materials',
    label: '其中：原材料',
    level: 2,
    terms: [{ prefix: '1403', side: 'net', sign: 1 }],
  },
  { key: 'inventory_work_in_process', label: '在产品', level: 2 },
  {
    key: 'inventory_finished_goods',
    label: '库存商品',
    level: 2,
    terms: [{ prefix: '1405', side: 'net', sign: 1 }],
  },
  {
    key: 'inventory_turnover_materials',
    label: '周转材料',
    level: 2,
    terms: [{ prefix: '1411', side: 'net', sign: 1 }],
  },
  {
    key: 'inventory',
    label: '存货',
    level: 1,
    combine: [
      { line: 'inventory_raw_materials', sign: 1 },
      { line: 'inventory_work_in_process', sign: 1 },
      { line: 'inventory_finished_goods', sign: 1 },
      { line: 'inventory_turnover_materials', sign: 1 },
    ],
  },
  {
    key: 'other_current_assets',
    label: '其他流动资产',
    level: 1,
    terms: [{ prefix: '1901', side: 'net', sign: 1 }],
  },
  {
    key: 'current_assets',
    label: '流动资产合计',
    level: 0,
    combine: [
      { line: 'cash', sign: 1 },
      { line: 'short_term_investments', sign: 1 },
      { line: 'notes_receivable', sign: 1 },
      { line: 'ar', sign: 1 },
      { line: 'prepayments', sign: 1 },
      { line: 'dividends_receivable', sign: 1 },
      { line: 'interest_receivable', sign: 1 },
      { line: 'other_receivables', sign: 1 },
      { line: 'inventory', sign: 1 },
      { line: 'other_current_assets', sign: 1 },
    ],
  },
  {
    key: 'long_term_bond_investments',
    label: '长期债券投资',
    level: 1,
    terms: [{ prefix: '1501', side: 'net', sign: 1 }],
  },
  {
    key: 'long_term_equity_investments',
    label: '长期股权投资',
    level: 1,
    terms: [{ prefix: '1511', side: 'net', sign: 1 }],
  },
  {
    key: 'fixed_assets_original',
    label: '固定资产原价',
    level: 1,
    terms: [{ prefix: '1601', side: 'net', sign: 1 }],
  },
  {
    key: 'accumulated_depreciation',
    label: '减：累计折旧',
    level: 1,
    terms: [{ prefix: '1602', side: 'credit', sign: 1 }],
  },
  {
    key: 'fixed_assets',
    label: '固定资产账面价值',
    level: 1,
    combine: [
      { line: 'fixed_assets_original', sign: 1 },
      { line: 'accumulated_depreciation', sign: -1 },
    ],
  },
  {
    key: 'construction_in_progress',
    label: '在建工程',
    level: 1,
    terms: [{ prefix: '1604', side: 'net', sign: 1 }],
  },
  {
    key: 'engineering_materials',
    label: '工程物资',
    level: 1,
    terms: [{ prefix: '1605', side: 'net', sign: 1 }],
  },
  {
    key: 'fixed_assets_disposal',
    label: '固定资产清理',
    level: 1,
    terms: [{ prefix: '1606', side: 'net', sign: 1 }],
  },
  {
    key: 'productive_biological_assets',
    label: '生产性生物资产',
    level: 1,
    terms: [{ prefix: '1621', side: 'net', sign: 1 }],
  },
  {
    key: 'intangible_assets',
    label: '无形资产',
    level: 1,
    // 1702 累计摊销 carries a credit balance, so its net (debit − credit) subtracts itself.
    terms: [
      { prefix: '1701', side: 'net', sign: 1 },
      { prefix: '1702', side: 'net', sign: 1 },
    ],
  },
  {
    key: 'development_expenditure',
    label: '开发支出',
    level: 1,
    terms: [{ prefix: '4301', side: 'net', sign: 1 }],
  },
  {
    key: 'long_term_deferred_expenses',
    label: '长期待摊费用',
    level: 1,
    terms: [{ prefix: '1801', side: 'net', sign: 1 }],
  },
  {
    key: 'other_noncurrent_assets',
    label: '其他非流动资产',
    level: 1,
    terms: [{ prefix: '1902', side: 'net', sign: 1 }],
  },
  {
    key: 'noncurrent_assets',
    label: '非流动资产合计',
    level: 0,
    combine: [
      { line: 'long_term_bond_investments', sign: 1 },
      { line: 'long_term_equity_investments', sign: 1 },
      { line: 'fixed_assets', sign: 1 },
      { line: 'construction_in_progress', sign: 1 },
      { line: 'engineering_materials', sign: 1 },
      { line: 'fixed_assets_disposal', sign: 1 },
      { line: 'productive_biological_assets', sign: 1 },
      { line: 'intangible_assets', sign: 1 },
      { line: 'development_expenditure', sign: 1 },
      { line: 'long_term_deferred_expenses', sign: 1 },
      { line: 'other_noncurrent_assets', sign: 1 },
    ],
  },
  {
    key: 'total_assets',
    label: '资产总计',
    level: 0,
    combine: [
      { line: 'current_assets', sign: 1 },
      { line: 'noncurrent_assets', sign: 1 },
    ],
  },
  {
    key: 'short_term_borrowings',
    label: '短期借款',
    level: 1,
    terms: [{ prefix: '2001', side: 'credit', sign: 1 }],
  },
  {
    key: 'notes_payable',
    label: '应付票据',
    level: 1,
    terms: [{ prefix: '2201', side: 'credit', sign: 1 }],
  },
  { key: 'ap', label: '应付账款', level: 1, terms: [{ prefix: '2202', side: 'credit', sign: 1 }] },
  {
    key: 'advances_from_customers',
    label: '预收账款',
    level: 1,
    terms: [{ prefix: '2203', side: 'credit', sign: 1 }],
  },
  {
    key: 'payroll_payable',
    label: '应付职工薪酬',
    level: 1,
    terms: [{ prefix: '2211', side: 'credit', sign: 1 }],
  },
  {
    key: 'taxes',
    label: '应交税费',
    level: 1,
    terms: [{ prefix: '2221', side: 'credit', sign: 1 }],
  },
  {
    key: 'interest_payable',
    label: '应付利息',
    level: 1,
    terms: [{ prefix: '2231', side: 'credit', sign: 1 }],
  },
  {
    key: 'profit_payable',
    label: '应付利润',
    level: 1,
    terms: [{ prefix: '2232', side: 'credit', sign: 1 }],
  },
  {
    key: 'other_payables',
    label: '其他应付款',
    level: 1,
    terms: [{ prefix: '2241', side: 'credit', sign: 1 }],
  },
  {
    key: 'other_current_liabilities',
    label: '其他流动负债',
    level: 1,
    terms: [{ prefix: '2291', side: 'credit', sign: 1 }],
  },
  {
    key: 'current_liabilities',
    label: '流动负债合计',
    level: 0,
    combine: [
      { line: 'short_term_borrowings', sign: 1 },
      { line: 'notes_payable', sign: 1 },
      { line: 'ap', sign: 1 },
      { line: 'advances_from_customers', sign: 1 },
      { line: 'payroll_payable', sign: 1 },
      { line: 'taxes', sign: 1 },
      { line: 'interest_payable', sign: 1 },
      { line: 'profit_payable', sign: 1 },
      { line: 'other_payables', sign: 1 },
      { line: 'other_current_liabilities', sign: 1 },
    ],
  },
  {
    key: 'long_term_borrowings',
    label: '长期借款',
    level: 1,
    terms: [{ prefix: '2501', side: 'credit', sign: 1 }],
  },
  {
    key: 'long_term_payables',
    label: '长期应付款',
    level: 1,
    terms: [{ prefix: '2701', side: 'credit', sign: 1 }],
  },
  {
    key: 'deferred_income',
    label: '递延收益',
    level: 1,
    terms: [{ prefix: '2401', side: 'credit', sign: 1 }],
  },
  {
    key: 'other_noncurrent_liabilities',
    label: '其他非流动负债',
    level: 1,
    terms: [{ prefix: '2801', side: 'credit', sign: 1 }],
  },
  {
    key: 'noncurrent_liabilities',
    label: '非流动负债合计',
    level: 0,
    combine: [
      { line: 'long_term_borrowings', sign: 1 },
      { line: 'long_term_payables', sign: 1 },
      { line: 'deferred_income', sign: 1 },
      { line: 'other_noncurrent_liabilities', sign: 1 },
    ],
  },
  {
    key: 'total_liabilities',
    label: '负债合计',
    level: 0,
    combine: [
      { line: 'current_liabilities', sign: 1 },
      { line: 'noncurrent_liabilities', sign: 1 },
    ],
  },
  {
    key: 'paid_in_capital',
    label: '实收资本（或股本）',
    level: 1,
    terms: [{ prefix: '4001', side: 'credit', sign: 1 }],
  },
  {
    key: 'capital_reserve',
    label: '资本公积',
    level: 1,
    terms: [{ prefix: '4002', side: 'credit', sign: 1 }],
  },
  {
    key: 'surplus_reserve',
    label: '盈余公积',
    level: 1,
    terms: [{ prefix: '4101', side: 'credit', sign: 1 }],
  },
  {
    key: 'retained_earnings',
    label: '未分配利润',
    level: 1,
    terms: [
      { prefix: '4103', side: 'credit', sign: 1 },
      { prefix: '4104', side: 'credit', sign: 1 },
    ],
    includesPnl: true,
  },
  {
    key: 'total_equity',
    label: '所有者权益合计',
    level: 0,
    combine: [
      { line: 'paid_in_capital', sign: 1 },
      { line: 'capital_reserve', sign: 1 },
      { line: 'surplus_reserve', sign: 1 },
      { line: 'retained_earnings', sign: 1 },
    ],
  },
  {
    key: 'total_liabilities_equity',
    label: '负债和所有者权益总计',
    level: 0,
    combine: [
      { line: 'total_liabilities', sign: 1 },
      { line: 'total_equity', sign: 1 },
    ],
  },
];

export const INCOME_STATEMENT_TEMPLATE: readonly ReportLineDef[] = [
  {
    key: 'revenue',
    label: '营业收入',
    level: 1,
    terms: [
      { prefix: '6001', side: 'credit', sign: 1 },
      { prefix: '6051', side: 'credit', sign: 1 },
    ],
  },
  {
    key: 'cogs',
    label: '营业成本',
    level: 1,
    terms: [
      { prefix: '6401', side: 'net', sign: 1 },
      { prefix: '6402', side: 'net', sign: 1 },
    ],
  },
  {
    key: 'taxes_surcharges',
    label: '税金及附加',
    level: 1,
    terms: [{ prefix: '6403', side: 'net', sign: 1 }],
  },
  { key: 'consumption_tax', label: '其中：消费税', level: 2 },
  { key: 'business_tax', label: '营业税', level: 2 },
  { key: 'city_maintenance_tax', label: '城市维护建设税', level: 2 },
  { key: 'resource_tax', label: '资源税', level: 2 },
  { key: 'land_appreciation_tax', label: '土地增值税', level: 2 },
  { key: 'property_related_taxes', label: '城镇土地使用税、房产税、车船税、印花税', level: 2 },
  { key: 'education_and_resource_fees', label: '教育费附加、矿产资源补偿费、排污费', level: 2 },
  {
    key: 'selling',
    label: '销售费用',
    level: 1,
    terms: [{ prefix: '6601', side: 'net', sign: 1 }],
  },
  { key: 'product_repair_expense', label: '其中：商品维修费', level: 2 },
  { key: 'advertising_expense', label: '广告费和业务宣传费', level: 2 },
  { key: 'admin', label: '管理费用', level: 1, terms: [{ prefix: '6602', side: 'net', sign: 1 }] },
  { key: 'organization_expense', label: '其中：开办费', level: 2 },
  { key: 'business_entertainment_expense', label: '业务招待费', level: 2 },
  { key: 'research_expense', label: '研究费用', level: 2 },
  {
    key: 'finance_exp',
    label: '财务费用',
    level: 1,
    terms: [{ prefix: '6603', side: 'net', sign: 1 }],
  },
  { key: 'interest_expense', label: '其中：利息费用（收入以“-”号填列）', level: 2 },
  {
    key: 'investment_income',
    label: '投资收益（损失以“-”号填列）',
    level: 1,
    terms: [{ prefix: '6111', side: 'credit', sign: 1 }],
  },
  {
    key: 'operating_profit',
    label: '营业利润（亏损以“-”号填列）',
    level: 0,
    combine: [
      { line: 'revenue', sign: 1 },
      { line: 'cogs', sign: -1 },
      { line: 'taxes_surcharges', sign: -1 },
      { line: 'selling', sign: -1 },
      { line: 'admin', sign: -1 },
      { line: 'finance_exp', sign: -1 },
      { line: 'investment_income', sign: 1 },
    ],
  },
  {
    key: 'nonoperating_income',
    label: '营业外收入',
    level: 1,
    terms: [{ prefix: '6301', side: 'credit', sign: 1 }],
  },
  { key: 'government_grants', label: '其中：政府补助', level: 2 },
  {
    key: 'nonoperating_expense',
    label: '营业外支出',
    level: 1,
    terms: [{ prefix: '6711', side: 'net', sign: 1 }],
  },
  { key: 'bad_debt_loss', label: '其中：坏账损失', level: 2 },
  { key: 'unrecoverable_bond_investment_loss', label: '无法收回的长期债券投资损失', level: 2 },
  { key: 'unrecoverable_equity_investment_loss', label: '无法收回的长期股权投资损失', level: 2 },
  { key: 'force_majeure_loss', label: '自然灾害等不可抗力因素造成的损失', level: 2 },
  { key: 'tax_late_fee', label: '税收滞纳金', level: 2 },
  {
    key: 'total_profit',
    label: '利润总额（亏损总额以“-”号填列）',
    level: 0,
    combine: [
      { line: 'operating_profit', sign: 1 },
      { line: 'nonoperating_income', sign: 1 },
      { line: 'nonoperating_expense', sign: -1 },
    ],
  },
  {
    key: 'income_tax_expense',
    label: '所得税费用',
    level: 1,
    terms: [{ prefix: '6801', side: 'net', sign: 1 }],
  },
  {
    key: 'net_profit',
    label: '净利润（净亏损以“-”号填列）',
    level: 0,
    combine: [
      { line: 'total_profit', sign: 1 },
      { line: 'income_tax_expense', sign: -1 },
    ],
  },
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
  return {
    from,
    to,
    lines,
    netProfit: lines.find((l) => l.key === 'net_profit')?.amount ?? '0.00',
  };
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
  readonly beginningCash: string;
  readonly endingCash: string;
  readonly tied: boolean;
}

const ACTIVITY_ORDER = ['operating', 'investing', 'financing'] as const;

interface CashFlowTemplateLine {
  readonly code: string;
  readonly name: string;
  readonly activity: (typeof ACTIVITY_ORDER)[number];
  readonly direction: 'inflow' | 'outflow';
  readonly sourceCodes: readonly string[];
}

const CASH_FLOW_TEMPLATE: readonly CashFlowTemplateLine[] = [
  {
    code: 'OP-IN-1',
    name: '销售产成品、商品、提供劳务收到的现金',
    activity: 'operating',
    direction: 'inflow',
    sourceCodes: ['OP-IN-1'],
  },
  {
    code: 'OP-IN-OTHER',
    name: '收到其他与经营活动有关的现金',
    activity: 'operating',
    direction: 'inflow',
    sourceCodes: ['OP-IN-2', 'OP-IN-3'],
  },
  {
    code: 'OP-OUT-1',
    name: '购买原材料、商品、接受劳务支付的现金',
    activity: 'operating',
    direction: 'outflow',
    sourceCodes: ['OP-OUT-1'],
  },
  {
    code: 'OP-OUT-2',
    name: '支付的职工薪酬',
    activity: 'operating',
    direction: 'outflow',
    sourceCodes: ['OP-OUT-2'],
  },
  {
    code: 'OP-OUT-3',
    name: '支付的税费',
    activity: 'operating',
    direction: 'outflow',
    sourceCodes: ['OP-OUT-3'],
  },
  {
    code: 'OP-OUT-4',
    name: '支付其他与经营活动有关的现金',
    activity: 'operating',
    direction: 'outflow',
    sourceCodes: ['OP-OUT-4'],
  },
  {
    code: 'IV-IN-1',
    name: '收回短期投资、长期债券投资和长期股权投资收到的现金',
    activity: 'investing',
    direction: 'inflow',
    sourceCodes: ['IV-IN-1'],
  },
  {
    code: 'IV-IN-RETURNS',
    name: '取得投资收益收到的现金',
    activity: 'investing',
    direction: 'inflow',
    sourceCodes: [],
  },
  {
    code: 'IV-IN-2',
    name: '处置固定资产、无形资产和其他非流动资产收回的现金净额',
    activity: 'investing',
    direction: 'inflow',
    sourceCodes: ['IV-IN-2'],
  },
  {
    code: 'IV-OUT-2',
    name: '短期投资、长期债券投资和长期股权投资支付的现金',
    activity: 'investing',
    direction: 'outflow',
    sourceCodes: ['IV-OUT-2'],
  },
  {
    code: 'IV-OUT-1',
    name: '购建固定资产、无形资产和其他非流动资产支付的现金',
    activity: 'investing',
    direction: 'outflow',
    sourceCodes: ['IV-OUT-1'],
  },
  {
    code: 'FN-IN-2',
    name: '取得借款收到的现金',
    activity: 'financing',
    direction: 'inflow',
    sourceCodes: ['FN-IN-2'],
  },
  {
    code: 'FN-IN-1',
    name: '吸收投资者投资收到的现金',
    activity: 'financing',
    direction: 'inflow',
    sourceCodes: ['FN-IN-1'],
  },
  {
    code: 'FN-OUT-1',
    name: '偿还借款本金支付的现金',
    activity: 'financing',
    direction: 'outflow',
    sourceCodes: ['FN-OUT-1'],
  },
  {
    code: 'FN-OUT-INTEREST',
    name: '偿还借款利息支付的现金',
    activity: 'financing',
    direction: 'outflow',
    sourceCodes: ['FN-OUT-2'],
  },
  {
    code: 'FN-OUT-DIVIDEND',
    name: '分配利润支付的现金',
    activity: 'financing',
    direction: 'outflow',
    sourceCodes: [],
  },
];

function cashBalanceAsOf(
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
  toExclusiveOrInclusive: string,
  inclusive: boolean,
): Decimal {
  const tb = computeTrialBalance(
    entries.filter((e) =>
      inclusive ? e.date <= toExclusiveOrInclusive : e.date < toExclusiveOrInclusive,
    ),
    openings,
  );
  return tb.rows.reduce(
    (acc, row) =>
      isCashAccountCode(row.accountCode)
        ? acc.plus(row.closingDebit).minus(row.closingCredit)
        : acc,
    new Decimal(0),
  );
}

/** Direct-method CF, grouped by CashFlowItem. amount per item = Σ tagged (credit − debit). */
export function cashFlowStatement(
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
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
    else if (e.cashFlowItem)
      byItem.set(
        e.cashFlowItem,
        (byItem.get(e.cashFlowItem) ?? new Decimal(0)).plus(credit).minus(debit),
      );
  }
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  const placedCodes = new Set<string>();
  let net = new Decimal(0);
  const activities: CashFlowActivityGroup[] = ACTIVITY_ORDER.map((activity) => {
    let subtotal = new Decimal(0);
    const lines: CashFlowStatementLine[] = CASH_FLOW_TEMPLATE.filter(
      (line) => line.activity === activity,
    ).map((line) => {
      const signedAmount = line.sourceCodes.reduce((acc, code) => {
        placedCodes.add(code);
        return acc.plus(byItem.get(code) ?? new Decimal(0));
      }, new Decimal(0));
      subtotal = subtotal.plus(signedAmount);
      const displayAmount = line.direction === 'outflow' ? signedAmount.negated() : signedAmount;
      return { code: line.code, name: line.name, amount: displayAmount.toFixed(2) };
    });
    for (const [code, amount] of byItem) {
      if (placedCodes.has(code)) continue;
      if ((itemByCode.get(code)?.activity ?? 'operating') !== activity) continue;
      const item = itemByCode.get(code);
      const displayAmount = item?.direction === 'outflow' ? amount.negated() : amount;
      lines.push({ code, name: item?.name ?? code, amount: displayAmount.toFixed(2) });
      subtotal = subtotal.plus(amount);
    }
    net = net.plus(subtotal);
    return { activity, lines, subtotal: subtotal.toFixed(2) };
  });
  const beginningCash = cashBalanceAsOf(entries, openings, from, false);
  const endingCash = cashBalanceAsOf(entries, openings, to, true);
  return {
    from,
    to,
    activities,
    netCashFlow: net.toFixed(2),
    beginningCash: beginningCash.toFixed(2),
    endingCash: endingCash.toFixed(2),
    tied: net.equals(cashChange) && endingCash.minus(beginningCash).equals(cashChange),
  };
}
