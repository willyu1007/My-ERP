import type { CashFlowStatement, IncomeStatement, ReportLine } from '@my-erp/api-client';

export type StatutoryStatementRowKind =
  | 'section'
  | 'primary'
  | 'detail'
  | 'subdetail'
  | 'subtotal'
  | 'grandTotal'
  | 'cashFlowDetail'
  | 'cashFlowSubtotal';

export interface StatutoryStatementRow {
  readonly key: string;
  readonly label: string;
  readonly kind: StatutoryStatementRowKind;
  readonly lineNo?: string;
  readonly amount?: string;
}

interface IncomeRowDef {
  readonly key: string;
  readonly label: string;
  readonly lineNo: string;
  readonly kind: StatutoryStatementRowKind;
}

const INCOME_ROWS: readonly IncomeRowDef[] = [
  { key: 'revenue', label: '一、营业收入', lineNo: '1', kind: 'primary' },
  { key: 'cogs', label: '减：营业成本', lineNo: '2', kind: 'detail' },
  { key: 'taxes_surcharges', label: '税金及附加', lineNo: '3', kind: 'detail' },
  { key: 'consumption_tax', label: '其中：消费税', lineNo: '4', kind: 'subdetail' },
  { key: 'business_tax', label: '营业税', lineNo: '5', kind: 'subdetail' },
  { key: 'city_maintenance_tax', label: '城市维护建设税', lineNo: '6', kind: 'subdetail' },
  { key: 'resource_tax', label: '资源税', lineNo: '7', kind: 'subdetail' },
  { key: 'land_appreciation_tax', label: '土地增值税', lineNo: '8', kind: 'subdetail' },
  {
    key: 'property_related_taxes',
    label: '城镇土地使用税、房产税、车船税、印花税',
    lineNo: '9',
    kind: 'subdetail',
  },
  {
    key: 'education_and_resource_fees',
    label: '教育费附加、矿产资源补偿费、排污费',
    lineNo: '10',
    kind: 'subdetail',
  },
  { key: 'selling', label: '销售费用', lineNo: '11', kind: 'detail' },
  { key: 'product_repair_expense', label: '其中：商品维修费', lineNo: '12', kind: 'subdetail' },
  { key: 'advertising_expense', label: '广告费和业务宣传费', lineNo: '13', kind: 'subdetail' },
  { key: 'admin', label: '管理费用', lineNo: '14', kind: 'detail' },
  { key: 'organization_expense', label: '其中：开办费', lineNo: '15', kind: 'subdetail' },
  { key: 'business_entertainment_expense', label: '业务招待费', lineNo: '16', kind: 'subdetail' },
  { key: 'research_expense', label: '研究费用', lineNo: '17', kind: 'subdetail' },
  { key: 'finance_exp', label: '财务费用', lineNo: '18', kind: 'detail' },
  {
    key: 'interest_expense',
    label: '其中：利息费用（收入以“-”号填列）',
    lineNo: '19',
    kind: 'subdetail',
  },
  {
    key: 'investment_income',
    label: '加：投资收益（损失以“-”号填列）',
    lineNo: '20',
    kind: 'detail',
  },
  {
    key: 'operating_profit',
    label: '二、营业利润（亏损以“-”号填列）',
    lineNo: '21',
    kind: 'subtotal',
  },
  { key: 'nonoperating_income', label: '加：营业外收入', lineNo: '22', kind: 'detail' },
  { key: 'government_grants', label: '其中：政府补助', lineNo: '23', kind: 'subdetail' },
  { key: 'nonoperating_expense', label: '减：营业外支出', lineNo: '24', kind: 'detail' },
  { key: 'bad_debt_loss', label: '其中：坏账损失', lineNo: '25', kind: 'subdetail' },
  {
    key: 'unrecoverable_bond_investment_loss',
    label: '无法收回的长期债券投资损失',
    lineNo: '26',
    kind: 'subdetail',
  },
  {
    key: 'unrecoverable_equity_investment_loss',
    label: '无法收回的长期股权投资损失',
    lineNo: '27',
    kind: 'subdetail',
  },
  {
    key: 'force_majeure_loss',
    label: '自然灾害等不可抗力因素造成的损失',
    lineNo: '28',
    kind: 'subdetail',
  },
  { key: 'tax_late_fee', label: '税收滞纳金', lineNo: '29', kind: 'subdetail' },
  {
    key: 'total_profit',
    label: '三、利润总额（亏损总额以“-”号填列）',
    lineNo: '30',
    kind: 'subtotal',
  },
  { key: 'income_tax_expense', label: '减：所得税费用', lineNo: '31', kind: 'detail' },
  { key: 'net_profit', label: '四、净利润（净亏损以“-”号填列）', lineNo: '32', kind: 'grandTotal' },
];

interface CashFlowLineDef {
  readonly code: string;
  readonly lineNo: string;
}

const CASH_FLOW_LINE_NOS: readonly CashFlowLineDef[] = [
  { code: 'OP-IN-1', lineNo: '1' },
  { code: 'OP-IN-OTHER', lineNo: '2' },
  { code: 'OP-OUT-1', lineNo: '3' },
  { code: 'OP-OUT-2', lineNo: '4' },
  { code: 'OP-OUT-3', lineNo: '5' },
  { code: 'OP-OUT-4', lineNo: '6' },
  { code: 'IV-IN-1', lineNo: '8' },
  { code: 'IV-IN-RETURNS', lineNo: '9' },
  { code: 'IV-IN-2', lineNo: '10' },
  { code: 'IV-OUT-2', lineNo: '11' },
  { code: 'IV-OUT-1', lineNo: '12' },
  { code: 'FN-IN-2', lineNo: '14' },
  { code: 'FN-IN-1', lineNo: '15' },
  { code: 'FN-OUT-1', lineNo: '16' },
  { code: 'FN-OUT-INTEREST', lineNo: '17' },
  { code: 'FN-OUT-DIVIDEND', lineNo: '18' },
];

const CASH_FLOW_SECTIONS: Record<
  string,
  { readonly label: string; readonly subtotalLabel: string; readonly lineNo: string }
> = {
  operating: {
    label: '一、经营活动产生的现金流量：',
    subtotalLabel: '经营活动产生的现金流量净额',
    lineNo: '7',
  },
  investing: {
    label: '二、投资活动产生的现金流量：',
    subtotalLabel: '投资活动产生的现金流量净额',
    lineNo: '13',
  },
  financing: {
    label: '三、筹资活动产生的现金流量：',
    subtotalLabel: '筹资活动产生的现金流量净额',
    lineNo: '19',
  },
};

function lineMap(lines: readonly ReportLine[]): ReadonlyMap<string, ReportLine> {
  return new Map(lines.map((line) => [line.key, line]));
}

export function buildIncomeStatementRows(
  statement: IncomeStatement,
): readonly StatutoryStatementRow[] {
  const lines = lineMap(statement.lines);
  return INCOME_ROWS.map((row) => ({
    ...row,
    amount: lines.get(row.key)?.amount,
  }));
}

export function buildCashFlowStatementRows(
  statement: CashFlowStatement,
): readonly StatutoryStatementRow[] {
  const lineNoByCode = new Map(CASH_FLOW_LINE_NOS.map((row) => [row.code, row.lineNo]));
  const rows: StatutoryStatementRow[] = [];

  for (const activity of statement.activities) {
    const section = CASH_FLOW_SECTIONS[activity.activity ?? ''];
    rows.push({
      key: `${activity.activity}-section`,
      label: section?.label ?? activity.activity ?? '',
      kind: 'section',
    });

    for (const line of activity.lines ?? []) {
      rows.push({
        key: `${activity.activity}-${line.code}`,
        label: line.name ?? line.code ?? '',
        lineNo: lineNoByCode.get(line.code ?? ''),
        kind: 'cashFlowDetail',
        amount: line.amount ?? '0.00',
      });
    }

    rows.push({
      key: `${activity.activity}-subtotal`,
      label: section?.subtotalLabel ?? `${activity.activity}现金流量净额`,
      lineNo: section?.lineNo,
      kind: 'cashFlowSubtotal',
      amount: activity.subtotal ?? '0.00',
    });
  }

  rows.push(
    {
      key: 'net_cash_flow',
      label: '四、现金净增加额',
      lineNo: '20',
      kind: 'cashFlowSubtotal',
      amount: statement.netCashFlow,
    },
    {
      key: 'beginning_cash',
      label: '加：期初现金余额',
      lineNo: '21',
      kind: 'cashFlowSubtotal',
      amount: statement.beginningCash,
    },
    {
      key: 'ending_cash',
      label: '五、期末现金余额',
      lineNo: '22',
      kind: 'grandTotal',
      amount: statement.endingCash,
    },
  );

  return rows;
}
