/**
 * Finance data-source — the single switch-point between demo data and the real
 * backend. W1 returns in-memory fixtures; the VM shapes are the contract, so
 * switching to live data (M1 P1–P5) means replacing only these bodies with
 * @my-erp/api-client calls to /v1 — pages and components stay untouched.
 *
 * TODO(P1–P5): const api = createApiClient(getRequestScope());
 *              return api.vouchers.list({ ledgerBookId });   // scoped + RLS-backed
 */
import { ACCOUNTS, OPENING_BALANCES, VOUCHERS } from './fixtures';
import { computeAccountLedger, computeTrialBalance, type AccountLedger, type TrialBalance } from './ledger';
import type { AccountVM, VoucherVM } from './types';

export async function listVouchers(): Promise<readonly VoucherVM[]> {
  return VOUCHERS;
}

export async function getVoucher(id: string): Promise<VoucherVM | null> {
  return VOUCHERS.find((v) => v.id === id) ?? null;
}

export async function listAccounts(): Promise<readonly AccountVM[]> {
  return ACCOUNTS;
}

// Ledger reports are derived locally from fixtures today; the real backend
// computes them server-side (post → balances) and returns the same shapes (P4).
export async function getTrialBalance(): Promise<TrialBalance> {
  return computeTrialBalance(ACCOUNTS, VOUCHERS, OPENING_BALANCES);
}

export async function getAccountLedger(code: string): Promise<AccountLedger | null> {
  return computeAccountLedger(code, ACCOUNTS, VOUCHERS, OPENING_BALANCES);
}
