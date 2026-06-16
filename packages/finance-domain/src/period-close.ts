import Decimal from 'decimal.js';

/**
 * 结转损益 (close profit & loss) — T-006 M3a. Builds the voucher that zeroes every
 * 损益类 (cost / profitLoss) account into 本年利润 (4103). The net carried = 净利润
 * (revenue − expense). Pure + exact (Decimal, never float).
 *
 * Given prior periods are closed (their 结转 vouchers zeroed the P&L accounts), a
 * P&L account's closing balance for this period equals the period's 发生额, so the
 * caller feeds the trial-balance closing of P&L accounts as-of the period end.
 */

/** Default 小企业准则 codes. */
export const PROFIT_OF_YEAR_CODE = '4103';
export const PROFIT_OF_YEAR_NAME = '本年利润';

export interface CloseInputRow {
  readonly accountCode: string;
  readonly accountName: string;
  readonly category: string; // asset | liability | equity | cost | profitLoss
  readonly closingDebit: string;
  readonly closingCredit: string;
}

export interface CloseLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly debit?: string;
  readonly credit?: string;
}

export interface CloseEntry {
  /** Voucher lines (>= 2 when there is anything to carry; empty when no P&L balances). */
  readonly lines: readonly CloseLine[];
  /** 净利润 — positive = profit, negative = loss, "0.00" when flat. */
  readonly netProfit: string;
}

function isProfitLoss(category: string): boolean {
  return category === 'cost' || category === 'profitLoss';
}

/**
 * Build the 结转损益 entry. Each P&L account is zeroed on its opposite side; the net
 * goes to 本年利润 (credit when profit, debit when loss). The result balances:
 * Σ revenue (debited) = total debit-from-zeroing; Σ expense (credited) = total
 * credit-from-zeroing; 本年利润 line = |revenue − expense| on the balancing side.
 */
export function buildCloseLossesEntry(
  rows: readonly CloseInputRow[],
  profitOfYear: { code: string; name: string } = {
    code: PROFIT_OF_YEAR_CODE,
    name: PROFIT_OF_YEAR_NAME,
  },
): CloseEntry {
  let revenueTotal = new Decimal(0); // credit-balance P&L (zeroed by debiting)
  let expenseTotal = new Decimal(0); // debit-balance P&L (zeroed by crediting)
  const lines: CloseLine[] = [];

  for (const r of rows) {
    if (!isProfitLoss(r.category)) continue;
    const net = new Decimal(r.closingDebit || 0).minus(r.closingCredit || 0); // >0 debit (expense), <0 credit (revenue)
    if (net.isZero()) continue;
    if (net.isNegative()) {
      const amount = net.neg();
      lines.push({ accountCode: r.accountCode, accountName: r.accountName, debit: amount.toFixed(2) });
      revenueTotal = revenueTotal.plus(amount);
    } else {
      lines.push({ accountCode: r.accountCode, accountName: r.accountName, credit: net.toFixed(2) });
      expenseTotal = expenseTotal.plus(net);
    }
  }

  const netProfit = revenueTotal.minus(expenseTotal);
  if (lines.length > 0 && !netProfit.isZero()) {
    lines.push(
      netProfit.isPositive()
        ? { accountCode: profitOfYear.code, accountName: profitOfYear.name, credit: netProfit.toFixed(2) }
        : { accountCode: profitOfYear.code, accountName: profitOfYear.name, debit: netProfit.neg().toFixed(2) },
    );
  }

  return { lines, netProfit: netProfit.toFixed(2) };
}
