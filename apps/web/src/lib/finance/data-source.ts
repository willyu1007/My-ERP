/**
 * Finance data-source — the single switch-point between demo data and the real
 * backend. W1 returns in-memory fixtures; the VM shapes are the contract, so
 * switching to live data (M1 P1–P5) means replacing only these bodies with
 * @my-erp/api-client calls to /v1 — pages and components stay untouched.
 *
 * TODO(P1–P5): const api = createApiClient(getRequestScope());
 *              return api.vouchers.list({ ledgerBookId });   // scoped + RLS-backed
 */
import { ACCOUNTS, VOUCHERS } from './fixtures';
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
