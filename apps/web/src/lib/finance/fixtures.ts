/**
 * Demo fixtures for the accountant workbench (W1). In-memory only — replaced by
 * real /v1 data in P1–P5 without changing the VM shapes. Every voucher here is
 * balanced (借贷必平); totals + balance flag are derived, not hand-written.
 */
import { centsToString, sumCents } from './money';
import type {
  AccountCategory,
  AccountDirection,
  AccountVM,
  AuxType,
  OpeningBalance,
  VoucherLineVM,
  VoucherStatus,
  VoucherVM,
} from './types';

interface AccountSeed {
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly direction: AccountDirection;
  readonly isLeaf: boolean;
  readonly parentCode: string | null;
  readonly level: number;
  readonly auxTypes?: readonly AuxType[];
  readonly active?: boolean;
}

// 《小企业会计准则》常用科目，含银行存款 / 应交税费的父子级；编码升序 = 树前序。
const ACCOUNT_SEEDS: readonly AccountSeed[] = [
  {
    code: '1001',
    name: '库存现金',
    category: 'asset',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
  },
  {
    code: '1002',
    name: '银行存款',
    category: 'asset',
    direction: 'debit',
    isLeaf: false,
    parentCode: null,
    level: 1,
  },
  {
    code: '100201',
    name: '工商银行',
    category: 'asset',
    direction: 'debit',
    isLeaf: true,
    parentCode: '1002',
    level: 2,
  },
  {
    code: '100202',
    name: '建设银行',
    category: 'asset',
    direction: 'debit',
    isLeaf: true,
    parentCode: '1002',
    level: 2,
    active: false,
  },
  {
    code: '1122',
    name: '应收账款',
    category: 'asset',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
    auxTypes: ['customer'],
  },
  {
    code: '1601',
    name: '固定资产',
    category: 'asset',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
  },
  {
    code: '2202',
    name: '应付账款',
    category: 'liability',
    direction: 'credit',
    isLeaf: true,
    parentCode: null,
    level: 1,
    auxTypes: ['supplier'],
  },
  {
    code: '2211',
    name: '应付职工薪酬',
    category: 'liability',
    direction: 'credit',
    isLeaf: true,
    parentCode: null,
    level: 1,
  },
  {
    code: '2221',
    name: '应交税费',
    category: 'liability',
    direction: 'credit',
    isLeaf: false,
    parentCode: null,
    level: 1,
  },
  {
    code: '222101',
    name: '应交增值税',
    category: 'liability',
    direction: 'credit',
    isLeaf: true,
    parentCode: '2221',
    level: 2,
  },
  {
    code: '4001',
    name: '实收资本',
    category: 'equity',
    direction: 'credit',
    isLeaf: true,
    parentCode: null,
    level: 1,
  },
  {
    code: '5001',
    name: '生产成本',
    category: 'cost',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
    auxTypes: ['project'],
  },
  {
    code: '6001',
    name: '主营业务收入',
    category: 'profitLoss',
    direction: 'credit',
    isLeaf: true,
    parentCode: null,
    level: 1,
  },
  {
    code: '6401',
    name: '主营业务成本',
    category: 'profitLoss',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
  },
  {
    code: '6601',
    name: '销售费用',
    category: 'profitLoss',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
    auxTypes: ['department'],
  },
  {
    code: '6602',
    name: '管理费用',
    category: 'profitLoss',
    direction: 'debit',
    isLeaf: true,
    parentCode: null,
    level: 1,
    auxTypes: ['department'],
  },
];

export const ACCOUNTS: readonly AccountVM[] = ACCOUNT_SEEDS.map((s) => ({
  id: `a-${s.code}`,
  code: s.code,
  name: s.name,
  category: s.category,
  direction: s.direction,
  isLeaf: s.isLeaf,
  parentCode: s.parentCode,
  level: s.level,
  auxTypes: s.auxTypes ?? [],
  active: s.active ?? true,
}));

interface VoucherSeed {
  readonly id: string;
  readonly no: string;
  readonly date: string;
  readonly period: string;
  readonly status: VoucherStatus;
  readonly summary: string;
  readonly maker: string;
  readonly checker: string | null;
  readonly attachments: number;
  readonly lines: readonly VoucherLineVM[];
}

/** Derive totals + balance from lines so fixtures can never drift out of balance. */
function buildVoucher(seed: VoucherSeed): VoucherVM {
  const debitCents = sumCents(seed.lines.map((l) => l.debit));
  const creditCents = sumCents(seed.lines.map((l) => l.credit));
  return {
    ...seed,
    totalDebit: centsToString(debitCents),
    totalCredit: centsToString(creditCents),
    balanced: debitCents === creditCents,
  };
}

const SEEDS: readonly VoucherSeed[] = [
  {
    id: 'v-001',
    no: '记-2026-001',
    date: '2026-06-01',
    period: '2026-06',
    status: 'posted',
    summary: '收到股东投资款',
    maker: '张会计',
    checker: '李主管',
    attachments: 2,
    lines: [
      {
        id: 'l-001-1',
        accountCode: '100201',
        accountName: '工商银行',
        summary: '收到股东投资',
        debit: '500000.00',
        credit: null,
      },
      {
        id: 'l-001-2',
        accountCode: '4001',
        accountName: '实收资本',
        summary: '收到股东投资',
        debit: null,
        credit: '500000.00',
      },
    ],
  },
  {
    id: 'v-002',
    no: '记-2026-002',
    date: '2026-06-03',
    period: '2026-06',
    status: 'posted',
    summary: '购买办公用品',
    maker: '张会计',
    checker: '李主管',
    attachments: 1,
    lines: [
      {
        id: 'l-002-1',
        accountCode: '6602',
        accountName: '管理费用',
        summary: '购买办公用品',
        debit: '1200.00',
        credit: null,
      },
      {
        id: 'l-002-2',
        accountCode: '100201',
        accountName: '工商银行',
        summary: '购买办公用品',
        debit: null,
        credit: '1200.00',
      },
    ],
  },
  {
    id: 'v-003',
    no: '记-2026-003',
    date: '2026-06-05',
    period: '2026-06',
    status: 'pending',
    summary: '确认销售收入（价税分离）',
    maker: '张会计',
    checker: null,
    attachments: 1,
    lines: [
      {
        id: 'l-003-1',
        accountCode: '1122',
        accountName: '应收账款',
        summary: '销售商品',
        debit: '33900.00',
        credit: null,
      },
      {
        id: 'l-003-2',
        accountCode: '6001',
        accountName: '主营业务收入',
        summary: '销售商品',
        debit: null,
        credit: '30000.00',
      },
      {
        id: 'l-003-3',
        accountCode: '222101',
        accountName: '应交增值税',
        summary: '销项税额 13%',
        debit: null,
        credit: '3900.00',
      },
    ],
  },
  {
    id: 'v-004',
    no: '记-2026-004',
    date: '2026-06-06',
    period: '2026-06',
    status: 'draft',
    summary: '计提 6 月工资',
    maker: '张会计',
    checker: null,
    attachments: 0,
    lines: [
      {
        id: 'l-004-1',
        accountCode: '6602',
        accountName: '管理费用',
        summary: '计提 6 月工资',
        debit: '20000.00',
        credit: null,
      },
      {
        id: 'l-004-2',
        accountCode: '2211',
        accountName: '应付职工薪酬',
        summary: '计提 6 月工资',
        debit: null,
        credit: '20000.00',
      },
    ],
  },
  {
    id: 'v-005',
    no: '记-2026-005',
    date: '2026-06-04',
    period: '2026-06',
    status: 'reversed',
    summary: '差旅费（误入，已红冲）',
    maker: '王出纳',
    checker: '李主管',
    attachments: 0,
    lines: [
      {
        id: 'l-005-1',
        accountCode: '6601',
        accountName: '销售费用',
        summary: '差旅费（误入，已红冲）',
        debit: '800.00',
        credit: null,
      },
      {
        id: 'l-005-2',
        accountCode: '1001',
        accountName: '库存现金',
        summary: '差旅费（误入，已红冲）',
        debit: null,
        credit: '800.00',
      },
    ],
  },
  {
    id: 'v-006',
    no: '记-2026-006',
    date: '2026-06-07',
    period: '2026-06',
    status: 'pending',
    summary: '采购固定资产',
    maker: '王出纳',
    checker: null,
    attachments: 3,
    lines: [
      {
        id: 'l-006-1',
        accountCode: '1601',
        accountName: '固定资产',
        summary: '采购办公电脑',
        debit: '15000.00',
        credit: null,
      },
      {
        id: 'l-006-2',
        accountCode: '2202',
        accountName: '应付账款',
        summary: '采购办公电脑',
        debit: null,
        credit: '15000.00',
      },
    ],
  },
];

export const VOUCHERS: readonly VoucherVM[] = SEEDS.map(buildVoucher);

// 启用期期初余额（演示）。借方合计 285000 = 贷方合计 285000，借贷平衡。
export const OPENING_BALANCES: readonly OpeningBalance[] = [
  { accountCode: '1001', debit: '5000.00', credit: null },
  { accountCode: '100201', debit: '200000.00', credit: null },
  { accountCode: '1601', debit: '80000.00', credit: null },
  { accountCode: '4001', debit: null, credit: '285000.00' },
];
