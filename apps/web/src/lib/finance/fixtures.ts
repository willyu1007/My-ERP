/**
 * Demo fixtures for the accountant workbench (W1). In-memory only — replaced by
 * real /v1 data in P1–P5 without changing the VM shapes. Every voucher here is
 * balanced (借贷必平); totals + balance flag are derived, not hand-written.
 */
import { centsToString, sumCents } from './money';
import type { AccountVM, VoucherLineVM, VoucherStatus, VoucherVM } from './types';

export const ACCOUNTS: readonly AccountVM[] = [
  { id: 'a-1001', code: '1001', name: '库存现金', category: 'asset', direction: 'debit', isLeaf: true },
  { id: 'a-1002', code: '1002', name: '银行存款', category: 'asset', direction: 'debit', isLeaf: true },
  { id: 'a-1122', code: '1122', name: '应收账款', category: 'asset', direction: 'debit', isLeaf: true },
  { id: 'a-1601', code: '1601', name: '固定资产', category: 'asset', direction: 'debit', isLeaf: true },
  { id: 'a-2202', code: '2202', name: '应付账款', category: 'liability', direction: 'credit', isLeaf: true },
  { id: 'a-2211', code: '2211', name: '应付职工薪酬', category: 'liability', direction: 'credit', isLeaf: true },
  { id: 'a-2221', code: '2221', name: '应交税费', category: 'liability', direction: 'credit', isLeaf: true },
  { id: 'a-4001', code: '4001', name: '实收资本', category: 'equity', direction: 'credit', isLeaf: true },
  { id: 'a-6001', code: '6001', name: '主营业务收入', category: 'profitLoss', direction: 'credit', isLeaf: true },
  { id: 'a-6401', code: '6401', name: '主营业务成本', category: 'profitLoss', direction: 'debit', isLeaf: true },
  { id: 'a-6601', code: '6601', name: '销售费用', category: 'profitLoss', direction: 'debit', isLeaf: true },
  { id: 'a-6602', code: '6602', name: '管理费用', category: 'profitLoss', direction: 'debit', isLeaf: true },
];

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
      { id: 'l-001-1', accountCode: '1002', accountName: '银行存款', summary: '收到股东投资', debit: '500000.00', credit: null },
      { id: 'l-001-2', accountCode: '4001', accountName: '实收资本', summary: '收到股东投资', debit: null, credit: '500000.00' },
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
      { id: 'l-002-1', accountCode: '6602', accountName: '管理费用', summary: '购买办公用品', debit: '1200.00', credit: null },
      { id: 'l-002-2', accountCode: '1002', accountName: '银行存款', summary: '购买办公用品', debit: null, credit: '1200.00' },
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
      { id: 'l-003-1', accountCode: '1122', accountName: '应收账款', summary: '销售商品', debit: '33900.00', credit: null },
      { id: 'l-003-2', accountCode: '6001', accountName: '主营业务收入', summary: '销售商品', debit: null, credit: '30000.00' },
      { id: 'l-003-3', accountCode: '2221', accountName: '应交税费', summary: '销项税额 13%', debit: null, credit: '3900.00' },
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
      { id: 'l-004-1', accountCode: '6602', accountName: '管理费用', summary: '计提 6 月工资', debit: '20000.00', credit: null },
      { id: 'l-004-2', accountCode: '2211', accountName: '应付职工薪酬', summary: '计提 6 月工资', debit: null, credit: '20000.00' },
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
      { id: 'l-005-1', accountCode: '6601', accountName: '销售费用', summary: '差旅费（误入，已红冲）', debit: '800.00', credit: null },
      { id: 'l-005-2', accountCode: '1001', accountName: '库存现金', summary: '差旅费（误入，已红冲）', debit: null, credit: '800.00' },
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
      { id: 'l-006-1', accountCode: '1601', accountName: '固定资产', summary: '采购办公电脑', debit: '15000.00', credit: null },
      { id: 'l-006-2', accountCode: '2202', accountName: '应付账款', summary: '采购办公电脑', debit: null, credit: '15000.00' },
    ],
  },
];

export const VOUCHERS: readonly VoucherVM[] = SEEDS.map(buildVoucher);
