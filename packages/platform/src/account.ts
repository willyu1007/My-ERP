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

/**
 * 《小企业会计准则》常用科目模板（幂等种子）。编码升序 = 树前序；含银行存款 /
 * 应交税费 父子级；辅助核算示意（往来 / 部门 / 项目）。
 */
export const STANDARD_CHART: readonly ChartAccountSeed[] = [
  {
    code: '1001',
    name: '库存现金',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '1002',
    name: '银行存款',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: false,
  },
  {
    code: '100201',
    name: '工商银行',
    category: 'asset',
    direction: 'debit',
    parentCode: '1002',
    level: 2,
    isLeaf: true,
  },
  {
    code: '100202',
    name: '建设银行',
    category: 'asset',
    direction: 'debit',
    parentCode: '1002',
    level: 2,
    isLeaf: true,
  },
  {
    code: '1122',
    name: '应收账款',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['customer'],
  },
  {
    code: '1601',
    name: '固定资产',
    category: 'asset',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '2202',
    name: '应付账款',
    category: 'liability',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['supplier'],
  },
  {
    code: '2211',
    name: '应付职工薪酬',
    category: 'liability',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '2221',
    name: '应交税费',
    category: 'liability',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: false,
  },
  {
    code: '222101',
    name: '应交增值税',
    category: 'liability',
    direction: 'credit',
    parentCode: '2221',
    level: 2,
    isLeaf: true,
  },
  {
    code: '4001',
    name: '实收资本',
    category: 'equity',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '4103',
    name: '本年利润',
    category: 'equity',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '4104',
    name: '利润分配',
    category: 'equity',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '5001',
    name: '生产成本',
    category: 'cost',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['project'],
  },
  {
    code: '6001',
    name: '主营业务收入',
    category: 'profitLoss',
    direction: 'credit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '6401',
    name: '主营业务成本',
    category: 'profitLoss',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
  },
  {
    code: '6601',
    name: '销售费用',
    category: 'profitLoss',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['department'],
  },
  {
    code: '6602',
    name: '管理费用',
    category: 'profitLoss',
    direction: 'debit',
    parentCode: null,
    level: 1,
    isLeaf: true,
    auxTypes: ['department'],
  },
];
