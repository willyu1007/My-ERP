import Decimal from 'decimal.js';

/**
 * Cashier settlement (出纳 收付款 → 结算凭证). Pure + exact (Decimal, never float).
 *
 * A confirmed PaymentDoc generates a balanced 2-line voucher:
 *  - receipt (收款, money in): 借 cash, 贷 contra   (e.g. 收回应收 借1002 / 贷1122)
 *  - payment (付款, money out): 借 contra, 贷 cash   (e.g. 付应付   借2202 / 贷1002)
 * The system records + posts the entry; it never moves money (no auto-disbursement).
 */
export type PaymentDirection = 'receipt' | 'payment';

export interface SettlementAccount {
  readonly code: string;
  readonly name: string;
}

export interface SettlementLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly debit?: string;
  readonly credit?: string;
  /** 辅助核算 for this line (contra/non-cash line only; T-012 Phase 3, D7). */
  readonly aux?: unknown;
  /** 现金流量项目 code for this line (contra/non-cash line only; T-006 M3b). */
  readonly cashFlowItem?: string | null;
}

export interface SettlementInput {
  readonly direction: PaymentDirection;
  /** Positive 2dp amount string. */
  readonly amount: string;
  readonly cash: SettlementAccount;
  readonly contra: SettlementAccount;
  /**
   * Accounting enrichment carried onto the CONTRA (non-cash) settlement line only
   * (T-012 Phase 3, D7): auxiliary dimensions + the cash-flow item. The cash line
   * stays money-only. Omitted for legacy/direct docs that were not enriched.
   */
  readonly contraAux?: unknown;
  readonly contraCashFlowItem?: string | null;
}

export interface SettlementEntry {
  readonly lines: readonly SettlementLine[];
  readonly totalDebit: string;
  readonly totalCredit: string;
}

/** Build the balanced settlement voucher lines for a confirmed payment document. */
export function buildSettlementEntry(input: SettlementInput): SettlementEntry {
  const amount = new Decimal(input.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new Error('settlement amount must be a positive number');
  }
  if (input.cash.code === input.contra.code) {
    throw new Error('settlement cash and contra accounts must differ');
  }
  const value = amount.toFixed(2);
  const cashLine: SettlementLine = { accountCode: input.cash.code, accountName: input.cash.name };
  // Auxiliary dimensions + cash-flow item ride the contra (non-cash) line (D7 / T-006 M3b).
  const contraLine: SettlementLine = {
    accountCode: input.contra.code,
    accountName: input.contra.name,
    ...(input.contraAux != null ? { aux: input.contraAux } : {}),
    ...(input.contraCashFlowItem ? { cashFlowItem: input.contraCashFlowItem } : {}),
  };

  const lines: SettlementLine[] =
    input.direction === 'receipt'
      ? [
          { ...cashLine, debit: value }, // money in → 借 现金/银行
          { ...contraLine, credit: value },
        ]
      : [
          { ...contraLine, debit: value },
          { ...cashLine, credit: value }, // money out → 贷 现金/银行
        ];

  return { lines, totalDebit: value, totalCredit: value };
}
