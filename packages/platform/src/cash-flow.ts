/**
 * 现金流量项目 standard seed (T-006 M3b) — 《小企业会计准则》 direct-method items,
 * plus a default account → item map (auto-suggest for the chart's non-cash lines).
 */
export type CashFlowActivity = 'operating' | 'investing' | 'financing';
export type CashFlowDirection = 'inflow' | 'outflow';

export interface CashFlowItemSeed {
  readonly code: string;
  readonly name: string;
  readonly activity: CashFlowActivity;
  readonly direction: CashFlowDirection;
}

export const STANDARD_CASH_FLOW_ITEMS: readonly CashFlowItemSeed[] = [
  // 经营活动
  {
    code: 'OP-IN-1',
    name: '销售商品、提供劳务收到的现金',
    activity: 'operating',
    direction: 'inflow',
  },
  { code: 'OP-IN-2', name: '收到的税费返还', activity: 'operating', direction: 'inflow' },
  {
    code: 'OP-IN-3',
    name: '收到其他与经营活动有关的现金',
    activity: 'operating',
    direction: 'inflow',
  },
  {
    code: 'OP-OUT-1',
    name: '购买商品、接受劳务支付的现金',
    activity: 'operating',
    direction: 'outflow',
  },
  {
    code: 'OP-OUT-2',
    name: '支付给职工以及为职工支付的现金',
    activity: 'operating',
    direction: 'outflow',
  },
  { code: 'OP-OUT-3', name: '支付的各项税费', activity: 'operating', direction: 'outflow' },
  {
    code: 'OP-OUT-4',
    name: '支付其他与经营活动有关的现金',
    activity: 'operating',
    direction: 'outflow',
  },
  // 投资活动
  {
    code: 'IV-IN-1',
    name: '收回投资、取得投资收益收到的现金',
    activity: 'investing',
    direction: 'inflow',
  },
  {
    code: 'IV-IN-2',
    name: '处置固定资产、无形资产收回的现金',
    activity: 'investing',
    direction: 'inflow',
  },
  {
    code: 'IV-OUT-1',
    name: '购建固定资产、无形资产支付的现金',
    activity: 'investing',
    direction: 'outflow',
  },
  { code: 'IV-OUT-2', name: '对外投资支付的现金', activity: 'investing', direction: 'outflow' },
  // 筹资活动
  { code: 'FN-IN-1', name: '吸收投资收到的现金', activity: 'financing', direction: 'inflow' },
  { code: 'FN-IN-2', name: '取得借款收到的现金', activity: 'financing', direction: 'inflow' },
  { code: 'FN-OUT-1', name: '偿还债务支付的现金', activity: 'financing', direction: 'outflow' },
  {
    code: 'FN-OUT-2',
    name: '分配股利、利润或偿付利息支付的现金',
    activity: 'financing',
    direction: 'outflow',
  },
];

/** Default 现金流量项目 per non-cash account (the auto-suggest source seeded onto the chart). */
export const DEFAULT_CASH_FLOW_BY_ACCOUNT: Readonly<Record<string, string>> = {
  '6001': 'OP-IN-1', // 主营业务收入
  '1122': 'OP-IN-1', // 应收账款
  '6601': 'OP-OUT-4', // 销售费用
  '6602': 'OP-OUT-4', // 管理费用
  '2202': 'OP-OUT-1', // 应付账款
  '1601': 'IV-OUT-1', // 固定资产
  '4001': 'FN-IN-1', // 实收资本
};
