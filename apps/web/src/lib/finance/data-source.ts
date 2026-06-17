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
import {
  ApiError,
  type BalanceSheet,
  type CaptureIntake,
  type CashFlowItem,
  type CashFlowStatement,
  type CreateVoucher,
  type IncomeStatement,
  type Intake,
  type PeriodClose,
  type PeriodCloseReadiness,
  type PeriodCloseResult,
  type TagCashFlow,
  type UntaggedCashLine,
  type WorkItem,
  type WorkItemAction,
  type WorkItemActionRequest,
  type WorkItemActionResult,
  type WorkItemView,
} from '@my-erp/api-client';
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

/** Replace a draft voucher's header + lines (only while draft). Requires the backend. */
export async function updateVoucher(id: string, input: CreateVoucher): Promise<VoucherVM> {
  return voucherToVM(await requireFinanceApi().updateVoucher(id, input));
}

/** Capture an economic event (base64 attachment) → an Intake. Requires the backend. */
export async function captureIntake(input: CaptureIntake): Promise<Intake> {
  return requireFinanceApi().captureIntake(input);
}

/** Run extraction on an intake (auto-drafts when high-confidence). Requires the backend. */
export async function extractIntake(id: string): Promise<Intake> {
  return requireFinanceApi().extractIntake(id);
}

// Ledger reports are derived locally from fixtures today; the real backend
// computes them server-side (post → balances) and returns the same shapes.
export async function getTrialBalance(): Promise<TrialBalance> {
  return computeTrialBalance(ACCOUNTS, VOUCHERS, OPENING_BALANCES);
}

export async function getAccountLedger(code: string): Promise<AccountLedger | null> {
  return computeAccountLedger(code, ACCOUNTS, VOUCHERS, OPENING_BALANCES);
}

// --- Statutory reports (T-006 M3c) ---
// The three statutory tables are computed server-side (post → balances → mapping).
// No fixture path: deriving 资产负债表 / 利润表 / 现金流量表 client-side would duplicate
// the report engine, so these return `null` in demo mode and the page shows a notice.

/** 资产负债表 as-of `to` (YYYY-MM-DD). `null` when the backend is not configured. */
export async function getBalanceSheet(to: string): Promise<BalanceSheet | null> {
  const api = getFinanceApi();
  if (!api) return null;
  return api.balanceSheet(to);
}

/** 利润表 over `[from, to]`. `null` when the backend is not configured. */
export async function getIncomeStatement(from: string, to: string): Promise<IncomeStatement | null> {
  const api = getFinanceApi();
  if (!api) return null;
  return api.incomeStatement(from, to);
}

/** 现金流量表 (direct method) over `[from, to]`. `null` when the backend is not configured. */
export async function getCashFlowStatement(
  from: string,
  to: string,
): Promise<CashFlowStatement | null> {
  const api = getFinanceApi();
  if (!api) return null;
  return api.cashFlowStatement(from, to);
}

// --- Period close (T-006 M3a) ---

/** All period-close records for the ledger (empty in demo mode). */
export async function listPeriods(): Promise<readonly PeriodClose[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listPeriods();
}

/** Close-readiness for a period. `null` when the backend is not configured. */
export async function getPeriodReadiness(period: string): Promise<PeriodCloseReadiness | null> {
  const api = getFinanceApi();
  if (!api) return null;
  return api.periodReadiness(period);
}

/** 期末结账: 结转损益 + lock the period. Requires the backend. */
export async function closePeriod(period: string): Promise<PeriodCloseResult> {
  return requireFinanceApi().closePeriod(period);
}

/** 反结账: 红冲 the 结转 voucher + reopen. Requires the backend. */
export async function reopenPeriod(period: string): Promise<PeriodClose> {
  return requireFinanceApi().reopenPeriod(period);
}

// --- Cash-flow tagging (T-006 M3b) ---

/** 现金流量项目 master (empty in demo mode). */
export async function listCashFlowItems(): Promise<readonly CashFlowItem[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listCashFlowItems();
}

/** Pre-close worklist: untagged non-cash lines of cash vouchers (empty in demo mode). */
export async function getUntaggedCashFlows(period?: string): Promise<readonly UntaggedCashLine[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.untaggedCashFlows(period);
}

/** Post-hoc 打标: set the CF item on a voucher's non-cash line(s). Requires the backend. */
export async function tagCashFlow(input: TagCashFlow): Promise<{ tagged: number }> {
  return requireFinanceApi().tagCashFlow(input);
}

// --- Task kernel / 我的工作台 (T-003 R2) ---

/** Work items for a view (`availableActions` is backend-computed). Empty in demo mode. */
export async function listWorkItems(view: WorkItemView): Promise<readonly WorkItem[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listWorkItems({ view });
}

/** A single work item, or `null` (not found / not visible / demo mode). */
export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const api = getFinanceApi();
  if (!api) return null;
  try {
    return await api.getWorkItem(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Run a backend-authorized work-item action (claim / complete / cancel). Requires the backend. */
export async function actOnWorkItem(
  id: string,
  actionKey: WorkItemAction,
  body: WorkItemActionRequest,
): Promise<WorkItemActionResult> {
  return requireFinanceApi().actOnWorkItem(id, actionKey, body);
}
