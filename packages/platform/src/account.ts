/** Chart-of-accounts vocabulary (《小企业会计准则》). Shared domain types so the
 *  API + seed agree; the web app keeps its own VM mirror. */
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'cost' | 'profitLoss';
export type AccountDirection = 'debit' | 'credit';
export type AuxType = 'customer' | 'supplier' | 'department' | 'project';

export const ACCOUNT_CATEGORY_LABELS: Record<AccountCategory, string> = {
  asset: '资产',
  liability: '负债',
  equity: '权益',
  cost: '成本',
  profitLoss: '损益',
};

export const ACCOUNT_DIRECTION_LABELS: Record<AccountDirection, string> = {
  debit: '借',
  credit: '贷',
};

export const AUX_TYPE_LABELS: Record<AuxType, string> = {
  customer: '客户',
  supplier: '供应商',
  department: '部门',
  project: '项目',
};

const CATEGORIES: ReadonlySet<string> = new Set([
  'asset',
  'liability',
  'equity',
  'cost',
  'profitLoss',
]);
const DIRECTIONS: ReadonlySet<string> = new Set(['debit', 'credit']);
const AUX_TYPES: ReadonlySet<string> = new Set(['customer', 'supplier', 'department', 'project']);

export function isAccountCategory(value: unknown): value is AccountCategory {
  return typeof value === 'string' && CATEGORIES.has(value);
}
export function isAccountDirection(value: unknown): value is AccountDirection {
  return typeof value === 'string' && DIRECTIONS.has(value);
}
export function isAuxType(value: unknown): value is AuxType {
  return typeof value === 'string' && AUX_TYPES.has(value);
}

export interface ChartAccountSeed {
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly direction: AccountDirection;
  readonly parentCode: string | null;
  readonly level: number;
  readonly isLeaf: boolean;
  readonly auxTypes?: readonly AuxType[];
}

/** `[code, name, direction, auxTypes?]` — parent/level/isLeaf are derived from code prefixes
 *  (child codes extend the parent code; the accounts API enforces the same rule). */
type ChartRow = readonly [
  code: string,
  name: string,
  direction: AccountDirection,
  auxTypes?: readonly AuxType[],
];

function buildSection(
  category: AccountCategory,
  rows: readonly ChartRow[],
): readonly ChartAccountSeed[] {
  const codes = rows.map(([code]) => code);
  const parentOf = (code: string): string | null => {
    let best: string | null = null;
    for (const c of codes) {
      if (c !== code && code.startsWith(c) && (best === null || c.length > best.length)) best = c;
    }
    return best;
  };
  const levelOf = (code: string): number => {
    const parent = parentOf(code);
    return parent === null ? 1 : levelOf(parent) + 1;
  };
  return rows.map(([code, name, direction, auxTypes]) => ({
    code,
    name,
    category,
    direction,
    parentCode: parentOf(code),
    level: levelOf(code),
    isLeaf: !codes.some((c) => c !== code && c.startsWith(code)),
    ...(auxTypes ? { auxTypes } : {}),
  }));
}

/** Template revision — bump when the chart list changes so ledgers can diff/import. */
export const STANDARD_CHART_VERSION = 2;

/**
 * 标准科目模板 v2（T-012 D6）：科目集合取自《小企业会计准则》附录（财会〔2011〕17 号）
 * 的常用科目，编码沿用本仓库既有约定（资产/负债类与官方一致；权益 4xxx、损益 6xxx 为
 * 既有编号体系，报表引擎/期末结账按这些前缀映射，见 finance-domain/report.ts、
 * period-close.ts）。刻意未收录行业特化科目（生物资产、工程施工/机械作业、计划成本法
 * 的材料采购/成本差异/进销差价）。客户/供应商/员工/报销人等对象一律走 BusinessPartner
 * 与辅助核算维度，不进科目树。编码升序 = 树前序。
 *
 * 新账套可直接种子；存量账套必须通过显式 diff/导入获得增量（不得静默变更）。
 */
export const STANDARD_CHART: readonly ChartAccountSeed[] = [
  ...buildSection('asset', [
    ['1001', '库存现金', 'debit'],
    ['1002', '银行存款', 'debit'],
    ['100201', '工商银行', 'debit'],
    ['100202', '建设银行', 'debit'],
    ['1012', '其他货币资金', 'debit'],
    ['1101', '短期投资', 'debit'],
    ['1121', '应收票据', 'debit'],
    ['1122', '应收账款', 'debit', ['customer']],
    ['1123', '预付账款', 'debit', ['supplier']],
    ['1131', '应收股利', 'debit'],
    ['1132', '应收利息', 'debit'],
    ['1221', '其他应收款', 'debit', ['customer']],
    ['1403', '原材料', 'debit'],
    ['1405', '库存商品', 'debit'],
    ['1411', '周转材料', 'debit'],
    ['1501', '长期债券投资', 'debit'],
    ['1511', '长期股权投资', 'debit'],
    ['1601', '固定资产', 'debit'],
    ['1602', '累计折旧', 'credit'],
    ['1604', '在建工程', 'debit'],
    ['1605', '工程物资', 'debit'],
    ['1606', '固定资产清理', 'debit'],
    ['1701', '无形资产', 'debit'],
    ['1702', '累计摊销', 'credit'],
    ['1801', '长期待摊费用', 'debit'],
    ['1901', '待处理财产损溢', 'debit'],
  ]),
  ...buildSection('liability', [
    ['2001', '短期借款', 'credit'],
    ['2201', '应付票据', 'credit'],
    ['2202', '应付账款', 'credit', ['supplier']],
    ['2203', '预收账款', 'credit', ['customer']],
    ['2211', '应付职工薪酬', 'credit'],
    ['221101', '工资', 'credit'],
    ['221102', '社会保险费', 'credit'],
    ['221103', '住房公积金', 'credit'],
    ['221104', '职工福利费', 'credit'],
    ['2221', '应交税费', 'credit'],
    ['222101', '应交增值税', 'credit'],
    ['222102', '未交增值税', 'credit'],
    ['222103', '应交企业所得税', 'credit'],
    ['222104', '应交个人所得税', 'credit'],
    ['222105', '应交城市维护建设税', 'credit'],
    ['222106', '应交教育费附加', 'credit'],
    ['222107', '应交地方教育附加', 'credit'],
    ['222108', '应交印花税', 'credit'],
    ['2231', '应付利息', 'credit'],
    ['2232', '应付利润', 'credit'],
    ['2241', '其他应付款', 'credit', ['supplier']],
    ['2401', '递延收益', 'credit'],
    ['2501', '长期借款', 'credit'],
    ['2701', '长期应付款', 'credit'],
  ]),
  ...buildSection('equity', [
    ['4001', '实收资本', 'credit'],
    ['4002', '资本公积', 'credit'],
    ['4101', '盈余公积', 'credit'],
    ['4103', '本年利润', 'credit'],
    ['4104', '利润分配', 'credit'],
  ]),
  ...buildSection('cost', [
    ['4301', '研发支出', 'debit'],
    ['5001', '生产成本', 'debit', ['project']],
    ['5101', '制造费用', 'debit', ['department']],
  ]),
  ...buildSection('profitLoss', [
    ['6001', '主营业务收入', 'credit'],
    ['6051', '其他业务收入', 'credit'],
    ['6111', '投资收益', 'credit'],
    ['6301', '营业外收入', 'credit'],
    ['6401', '主营业务成本', 'debit'],
    ['6402', '其他业务成本', 'debit'],
    ['6403', '税金及附加', 'debit'],
    ['6601', '销售费用', 'debit', ['department']],
    ['660101', '职工薪酬', 'debit', ['department']],
    ['660102', '广告费和业务宣传费', 'debit', ['department']],
    ['660103', '运输费', 'debit', ['department']],
    ['660104', '差旅费', 'debit', ['department']],
    ['660105', '业务招待费', 'debit', ['department']],
    ['660106', '商品维修费', 'debit', ['department']],
    ['660199', '其他销售费用', 'debit', ['department']],
    ['6602', '管理费用', 'debit', ['department']],
    ['660201', '职工薪酬', 'debit', ['department']],
    ['660202', '办公费', 'debit', ['department']],
    ['660203', '差旅费', 'debit', ['department']],
    ['660204', '业务招待费', 'debit', ['department']],
    ['660205', '租赁费', 'debit', ['department']],
    ['660206', '水电费', 'debit', ['department']],
    ['660207', '折旧与摊销', 'debit', ['department']],
    ['660208', '开办费', 'debit', ['department']],
    ['660209', '研究费用', 'debit', ['department']],
    ['660210', '咨询服务费', 'debit', ['department']],
    ['660299', '其他管理费用', 'debit', ['department']],
    ['6603', '财务费用', 'debit'],
    ['660301', '利息费用', 'debit'],
    ['660302', '利息收入', 'debit'],
    ['660303', '手续费', 'debit'],
    ['660399', '其他财务费用', 'debit'],
    ['6711', '营业外支出', 'debit'],
    ['6801', '所得税费用', 'debit'],
  ]),
];
