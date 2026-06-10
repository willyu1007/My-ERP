/**
 * Finance view-models (VM) — the single source of truth for the accountant
 * workbench UI. Pages and components depend only on these shapes; switching the
 * data-source from demo fixtures to the real /v1 API (P1–P5) must not change
 * them. Keep this file domain-typed and presentation-agnostic (no React).
 */
import type { CardTone } from '@my-erp/ui';

/** 会计科目类别（《小企业会计准则》一级分类）。 */
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'cost' | 'profitLoss';

/** 科目余额方向（借/贷）。 */
export type AccountDirection = 'debit' | 'credit';

/** 辅助核算维度（往来 = 客户/供应商，部门，项目）。 */
export type AuxType = 'customer' | 'supplier' | 'department' | 'project';

/** 凭证状态机（M1 P3 落地：草稿→待审→已过账，红冲为反向凭证）。 */
export type VoucherStatus = 'draft' | 'pending' | 'posted' | 'reversed';

export interface AccountVM {
  readonly id: string;
  /** 科目编码，如 "1002"；编码升序即树前序。 */
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly direction: AccountDirection;
  /** 末级科目才可挂分录。 */
  readonly isLeaf: boolean;
  /** 上级科目编码；一级科目为 null。 */
  readonly parentCode: string | null;
  /** 层级深度（1 = 一级科目）。 */
  readonly level: number;
  /** 辅助核算维度；无则空数组。 */
  readonly auxTypes: readonly AuxType[];
  /** 是否启用（停用科目不可挂新分录）。 */
  readonly active: boolean;
}

export interface VoucherLineVM {
  readonly id: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly summary: string;
  /** 借方金额，规范 2 位小数字符串；该方为空时为 null（绝不用浮点）。 */
  readonly debit: string | null;
  /** 贷方金额，规范 2 位小数字符串；该方为空时为 null。 */
  readonly credit: string | null;
}

export interface VoucherVM {
  readonly id: string;
  /** 凭证号，如 "记-2026-001"。 */
  readonly no: string;
  /** 制单日期 ISO（YYYY-MM-DD）。 */
  readonly date: string;
  /** 会计期间，如 "2026-06"。 */
  readonly period: string;
  readonly status: VoucherStatus;
  readonly summary: string;
  readonly lines: readonly VoucherLineVM[];
  /** 借方合计（2 位小数）。 */
  readonly totalDebit: string;
  /** 贷方合计（2 位小数）。 */
  readonly totalCredit: string;
  /** 借贷是否平衡（借方合计 === 贷方合计）。 */
  readonly balanced: boolean;
  readonly maker: string;
  /** 审核人；未审核为 null（制单人 ≠ 审核人，SoD 在服务层强制）。 */
  readonly checker: string | null;
  readonly attachments: number;
}

/** 期初余额（启用期建账）。借/贷二选一，全部期初合计须借贷平衡。 */
export interface OpeningBalance {
  readonly accountCode: string;
  readonly debit: string | null;
  readonly credit: string | null;
}

/* ---------- 中文标签与 tone 映射（领域语义留在财务层） ---------- */

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

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  posted: '已过账',
  reversed: '已红冲',
};

/** 凭证状态 → Badge 语义色（领域 status→tone 映射，保持 @my-erp/ui 领域无关）。 */
export function voucherStatusTone(status: VoucherStatus): CardTone | undefined {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'posted':
      return 'success';
    case 'reversed':
      return 'danger';
    case 'draft':
      return 'muted';
  }
}
