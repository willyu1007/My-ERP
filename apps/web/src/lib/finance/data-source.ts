/**
 * Finance data-source — the single switch-point between demo data and the real
 * backend. The VM shapes are the contract, so reads use the real `/v1` client
 * when configured (`API_BASE_URL` + `API_DEV_TOKEN`) and fall back to in-memory
 * fixtures otherwise — pages and components stay untouched (T-004 S1b cutover).
 *
 * Reversible: unset the env to return to fixtures. Ledger reports stay on
 * fixtures for S1 (the client surface is scoped to voucher + account); they
 * cut over with the report milestone.
 */
import { ApiError, type CreateVoucher } from '@my-erp/api-client';
import { ACCOUNTS, OPENING_BALANCES, VOUCHERS } from './fixtures';
import {
  computeAccountLedger,
  computeTrialBalance,
  type AccountLedger,
  type TrialBalance,
} from './ledger';
import { getFinanceApi, requireFinanceApi } from './request-scope';
import type { AccountVM, VoucherVM } from './types';
import { accountToVM, voucherToVM } from './vm-map';

export async function listVouchers(): Promise<readonly VoucherVM[]> {
  const api = getFinanceApi();
  if (!api) return VOUCHERS;
  return (await api.listVouchers()).map(voucherToVM);
}

export async function getVoucher(id: string): Promise<VoucherVM | null> {
  const api = getFinanceApi();
  if (!api) return VOUCHERS.find((v) => v.id === id) ?? null;
  try {
    return voucherToVM(await api.getVoucher(id));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function listAccounts(): Promise<readonly AccountVM[]> {
  const api = getFinanceApi();
  if (!api) return ACCOUNTS;
  return (await api.listAccounts()).map(accountToVM);
}

/** Create a draft voucher. Requires the backend (mutations cannot demo). */
export async function createVoucher(input: CreateVoucher): Promise<VoucherVM> {
  return voucherToVM(await requireFinanceApi().createVoucher(input));
}

/** Submit a draft for review (draft → pending). Requires the backend. */
export async function submitVoucher(id: string): Promise<VoucherVM> {
  return voucherToVM(await requireFinanceApi().submitVoucher(id));
}

// Ledger reports are derived locally from fixtures today; the real backend
// computes them server-side (post → balances) and returns the same shapes.
export async function getTrialBalance(): Promise<TrialBalance> {
  return computeTrialBalance(ACCOUNTS, VOUCHERS, OPENING_BALANCES);
}

export async function getAccountLedger(code: string): Promise<AccountLedger | null> {
  return computeAccountLedger(code, ACCOUNTS, VOUCHERS, OPENING_BALANCES);
}
