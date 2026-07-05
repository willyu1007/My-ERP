/**
 * 现金及现金等价物科目（库存现金 / 银行存款 / 其他货币资金）。Mirrors the canonical
 * `CASH_ACCOUNT_ROOT_CODES`/`isCashAccountCode` in `@my-erp/finance-domain` (the web
 * app doesn't depend on it); keep the two root sets in sync. Child codes extend their
 * parent's code, so the root-prefix match is the tree-ancestor test — subaccounts are
 * covered automatically. Drives the CF-tag picker + the cashier cash-account list.
 */
const CASH_ACCOUNT_ROOT_CODES: readonly string[] = ['1001', '1002', '1012'];

export function isCashAccountCode(code: string): boolean {
  return CASH_ACCOUNT_ROOT_CODES.some((root) => code.startsWith(root));
}
