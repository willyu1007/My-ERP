import Decimal from 'decimal.js';
import type { PostedLine } from './ledger';

/**
 * Cash-flow tagging domain (T-006 M3b). The direct-method CF statement is derived
 * from `cashFlowItem` tags on the NON-cash lines of cash-involved vouchers (D1).
 * Pure + exact (Decimal). Cash accounts are identified by code prefix.
 */

/** 库存现金 / 银行存款 / 其他货币资金. */
export function isCashAccountCode(code: string): boolean {
  return code.startsWith('1001') || code.startsWith('1002') || code.startsWith('1012');
}

export interface CashFlowTieOut {
  /** Σ cash-account lines (debit − credit). */
  readonly cashNetChange: string;
  /** Σ tagged non-cash lines (credit − debit) — the cash effect of the tagged contras. */
  readonly taggedFlows: string;
  readonly difference: string;
  readonly tied: boolean;
}

/**
 * Tie-out (the CF 借贷必平): tagged flows must equal the net change in cash accounts
 * over the given (already date-filtered) entries. A mismatch means missing/wrong tags.
 */
export function cashFlowTieOut(entries: readonly PostedLine[]): CashFlowTieOut {
  let cash = new Decimal(0);
  let tagged = new Decimal(0);
  for (const e of entries) {
    const debit = new Decimal(e.debit || 0);
    const credit = new Decimal(e.credit || 0);
    if (isCashAccountCode(e.accountCode)) {
      cash = cash.plus(debit).minus(credit);
    } else if (e.cashFlowItem) {
      tagged = tagged.plus(credit).minus(debit);
    }
  }
  const difference = cash.minus(tagged);
  return {
    cashNetChange: cash.toFixed(2),
    taggedFlows: tagged.toFixed(2),
    difference: difference.toFixed(2),
    tied: difference.isZero(),
  };
}

export interface UntaggedCashLine {
  readonly voucherId: string;
  readonly voucherNo: string;
  readonly date: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly debit: string | null;
  readonly credit: string | null;
  readonly summary: string;
}

/**
 * The pre-close worklist: non-cash lines of cash-involved vouchers that lack a
 * `cashFlowItem`. These must be tagged for the CF statement to tie out.
 */
export function listUntaggedCashFlows(entries: readonly PostedLine[]): UntaggedCashLine[] {
  const byVoucher = new Map<string, PostedLine[]>();
  for (const e of entries) {
    const arr = byVoucher.get(e.voucherId);
    if (arr) arr.push(e);
    else byVoucher.set(e.voucherId, [e]);
  }
  const out: UntaggedCashLine[] = [];
  for (const lines of byVoucher.values()) {
    if (!lines.some((l) => isCashAccountCode(l.accountCode))) continue;
    for (const l of lines) {
      if (!isCashAccountCode(l.accountCode) && !l.cashFlowItem) {
        out.push({
          voucherId: l.voucherId,
          voucherNo: l.voucherNo,
          date: l.date,
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: l.debit,
          credit: l.credit,
          summary: l.summary,
        });
      }
    }
  }
  return out;
}
