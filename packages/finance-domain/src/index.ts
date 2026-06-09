import Decimal from 'decimal.js';

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
