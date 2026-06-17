import Decimal from 'decimal.js';

export * from './ledger';
export * from './posting-template';
export * from './period-close';
export * from './cash-flow';
export * from './report';
export * from './cashier';

/**
 * Money — amounts are always exact decimals, never IEEE floats (hard constraint).
 * Persistence uses Postgres NUMERIC / Prisma Decimal; in-memory math uses decimal.js.
 * Amounts are scaled to 2 decimal places; unit prices / FX rates (4dp) come later.
 */
export class Money {
  private readonly amount: Decimal;

  private constructor(amount: Decimal) {
    this.amount = amount;
  }

  static of(value: Decimal.Value): Money {
    return new Money(new Decimal(value));
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  add(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }

  subtract(other: Money): Money {
    return new Money(this.amount.minus(other.amount));
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  equals(other: Money): boolean {
    return this.amount.equals(other.amount);
  }

  /** Canonical 2dp string for persistence / display. */
  toString(): string {
    return this.amount.toFixed(2);
  }

  toDecimal(): Decimal {
    return this.amount;
  }
}

/** A voucher is balanced iff total debits equal total credits (借贷必平). */
export function isBalanced(debits: Money[], credits: Money[]): boolean {
  const sum = (xs: Money[]) => xs.reduce((acc, m) => acc.add(m), Money.zero());
  return sum(debits).equals(sum(credits));
}

/** A voucher line carries a debit XOR a credit amount (2dp string), the other null. */
export interface VoucherLineAmounts {
  readonly debit?: string | null;
  readonly credit?: string | null;
}

/**
 * Validate a voucher's lines as a balanced double entry (借贷必平). Returns an
 * error message, or null when valid. Uses exact Decimal money (no float). Rules:
 * at least two lines; each line exactly one of debit/credit (> 0); non-zero
 * total; debits === credits.
 */
export function voucherBalanceError(lines: readonly VoucherLineAmounts[]): string | null {
  if (lines.length < 2) return 'a voucher needs at least two entry lines';
  let debit = Money.zero();
  let credit = Money.zero();
  for (const line of lines) {
    const hasDebit = line.debit != null && line.debit !== '';
    const hasCredit = line.credit != null && line.credit !== '';
    if (hasDebit && hasCredit) return 'a line cannot have both a debit and a credit';
    if (!hasDebit && !hasCredit) return 'each line must have a debit or a credit amount';
    if (hasDebit) debit = debit.add(Money.of(line.debit as string));
    if (hasCredit) credit = credit.add(Money.of(line.credit as string));
  }
  if (debit.isZero()) return 'voucher total cannot be zero';
  if (!debit.equals(credit)) return 'debits must equal credits (借贷必平)';
  return null;
}

/**
 * Validate opening balances (期初余额) as a balanced set (启用期试算平衡). An empty
 * set is a fresh book (valid). Each entry carries a debit XOR a credit; the
 * totals must balance.
 */
export function openingBalanceError(openings: readonly VoucherLineAmounts[]): string | null {
  if (openings.length === 0) return null;
  let debit = Money.zero();
  let credit = Money.zero();
  for (const o of openings) {
    const hasDebit = o.debit != null && o.debit !== '';
    const hasCredit = o.credit != null && o.credit !== '';
    if (hasDebit && hasCredit) return 'an opening balance cannot have both a debit and a credit';
    if (!hasDebit && !hasCredit) return 'each opening balance must have a debit or a credit';
    if (hasDebit) debit = debit.add(Money.of(o.debit as string));
    if (hasCredit) credit = credit.add(Money.of(o.credit as string));
  }
  if (!debit.equals(credit)) return 'opening balances must be balanced (启用期借=贷)';
  return null;
}
