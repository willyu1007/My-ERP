/**
 * 现金及现金等价物科目（库存现金 / 银行存款 / 其他货币资金）。Mirrors the canonical
 * `isCashAccountCode` in `@my-erp/finance-domain` (the web app doesn't depend on it);
 * keep the two prefix sets in sync. Drives the CF-tag picker + the cashier cash-account list.
 */
export function isCashAccountCode(code: string): boolean {
  return code.startsWith('1001') || code.startsWith('1002') || code.startsWith('1012');
}
