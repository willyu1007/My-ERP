/**
 * Front-end money helpers — exact integer-cents arithmetic, never IEEE floats
 * (hard constraint: 金额禁用浮点). This mirrors the authoritative invariant in
 * @my-erp/finance-domain (借贷必平), which the server enforces at posting time
 * (M1 P3). Here it only gates the create-voucher form UX.
 *
 * Amounts are canonical 2-decimal strings (e.g. "1234.56"); cents are integers.
 */

/** Parse a 2dp amount string to integer cents. Returns null if malformed. */
export function toCents(amount: string): number | null {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(amount);
  if (!match) return null;
  const yuan = Number(match[1]);
  const fractional = (match[2] ?? '').padEnd(2, '0');
  return yuan * 100 + Number(fractional);
}

/** Render integer cents back to a canonical 2dp string. */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Sum a column of optional amount strings into integer cents (skips null/empty). */
export function sumCents(amounts: readonly (string | null | undefined)[]): number {
  let total = 0;
  for (const a of amounts) {
    if (a == null || a === '') continue;
    const c = toCents(a);
    if (c != null) total += c;
  }
  return total;
}

/** 借贷必平：debit cents must equal credit cents. */
export function isBalanced(debitCents: number, creditCents: number): boolean {
  return debitCents === creditCents;
}
