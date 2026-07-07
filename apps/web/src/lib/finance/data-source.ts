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
  type AccountPreferences,
  type BalanceSheet,
  type BusinessPartner,
  type CaptureIntake,
  type CashFlowItem,
  type CashFlowStatement,
  type CreateBusinessPartner,
  type CreateVoucher,
  type Contract,
  type ContractStatus,
  type ContractTimeline,
  type ContractType,
  type CreateContract,
  type ConsumeFundConsumption,
  type CreatePayment,
  type EnrichPayment,
  type FundConsumption,
  type FundExecutionStatus,
  type FundReconciliationStatus,
  type UploadFundReceipt,
  type IncomeStatement,
  type Intake,
  type Membership,
  type PartnerPartyType,
  type PartnerRole,
  type PaymentConfirmResult,
  type PaymentDirection,
  type PaymentDoc,
  type PaymentStatus,
  type PeriodClose,
  type PeriodCloseReadiness,
  type PeriodCloseResult,
  type StandardChartDiff,
  type StandardChartImportResult,
  type TagCashFlow,
  type UntaggedCashLine,
  type UpdateBusinessPartner,
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
import type { AccountVM, OpeningBalance, VoucherVM } from './types';
import { accountLedgerToVM, accountToVM, trialBalanceToVM, voucherToVM } from './vm-map';

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

const zeroToNull = (amount: string): string | null =>
  amount === '' || amount === '0.00' ? null : amount;

function vouchersInPeriod(period?: string): readonly VoucherVM[] {
  if (!period) return VOUCHERS;
  return VOUCHERS.filter((voucher) => voucher.period === period);
}

function openingBalancesForPeriod(period?: string): readonly OpeningBalance[] {
  if (!period) return OPENING_BALANCES;
  const priorVouchers = VOUCHERS.filter((voucher) => voucher.period < period);
  if (priorVouchers.length === 0) return OPENING_BALANCES;
  const prior = computeTrialBalance(ACCOUNTS, priorVouchers, OPENING_BALANCES);
  return prior.rows.map((row) => ({
    accountCode: row.code,
    debit: zeroToNull(row.closingDebit),
    credit: zeroToNull(row.closingCredit),
  }));
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

/** Captured source documents for the intake workbench (empty in demo mode). */
export async function listIntakes(filters?: { status?: string }): Promise<readonly Intake[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listIntakes(filters);
}

/** Run extraction on an intake (auto-drafts when high-confidence). Requires the backend. */
export async function extractIntake(id: string): Promise<Intake> {
  return requireFinanceApi().extractIntake(id);
}

/** Create a voucher draft from an extracted intake. Requires the backend. */
export async function draftIntake(id: string): Promise<Intake> {
  return requireFinanceApi().draftIntake(id);
}

/** Discard an intake that should not enter accounting. Requires the backend. */
export async function discardIntake(id: string): Promise<Intake> {
  return requireFinanceApi().discardIntake(id);
}

// Trial balance / account ledger: the backend derives them server-side (post →
// balances); the data-source maps the `/v1` shape to the same VM. Demo mode falls
// back to the fixture-derived computation.
export async function getTrialBalance(period?: string): Promise<TrialBalance> {
  const api = getFinanceApi();
  if (!api) {
    return computeTrialBalance(
      ACCOUNTS,
      vouchersInPeriod(period),
      openingBalancesForPeriod(period),
    );
  }
  return trialBalanceToVM(await api.trialBalance({ period }));
}

export async function getAccountLedger(
  code: string,
  period?: string,
): Promise<AccountLedger | null> {
  const api = getFinanceApi();
  if (!api) {
    return computeAccountLedger(
      code,
      ACCOUNTS,
      vouchersInPeriod(period),
      openingBalancesForPeriod(period),
    );
  }
  try {
    return accountLedgerToVM(await api.accountLedger(code, { period }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
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
export async function getIncomeStatement(
  from: string,
  to: string,
): Promise<IncomeStatement | null> {
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

/** Count of my open/claimed tasks for the sidebar badge (`0` in demo mode). */
export async function countMyOpenTasks(): Promise<number> {
  const api = getFinanceApi();
  if (!api) return 0;
  return (await api.listWorkItems({ view: 'my_tasks' })).length;
}

/** Run a backend-authorized work-item action (claim / complete / cancel). Requires the backend. */
export async function actOnWorkItem(
  id: string,
  actionKey: WorkItemAction,
  body: WorkItemActionRequest,
): Promise<WorkItemActionResult> {
  return requireFinanceApi().actOnWorkItem(id, actionKey, body);
}

// --- Cashier payments (T-007 出纳收付款) ---

/** 收付款单 for a view (empty in demo mode). */
export async function listPayments(filters?: {
  status?: PaymentStatus;
  direction?: PaymentDirection;
  partnerId?: string;
}): Promise<readonly PaymentDoc[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listPayments(filters);
}

/** A single payment doc, or `null` (not found / demo mode). */
export async function getPayment(id: string): Promise<PaymentDoc | null> {
  const api = getFinanceApi();
  if (!api) return null;
  try {
    return await api.getPayment(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Create a 收/付款单 draft. Requires the backend. */
export async function createPayment(input: CreatePayment): Promise<PaymentDoc> {
  return requireFinanceApi().createPayment(input);
}

/** Accountant enrichment: complete accounting facts on a cashier doc (T-012 Phase 3). */
export async function enrichPayment(id: string, input: EnrichPayment): Promise<PaymentDoc> {
  return requireFinanceApi().enrichPayment(id, input);
}

/** Advance a payment doc. Requires the backend. */
export async function submitPayment(id: string, expectedVersion: number): Promise<PaymentDoc> {
  return requireFinanceApi().submitPayment(id, expectedVersion);
}
export async function approvePayment(id: string, expectedVersion: number): Promise<PaymentDoc> {
  return requireFinanceApi().approvePayment(id, expectedVersion);
}
export async function confirmPayment(
  id: string,
  expectedVersion: number,
  confirmSinglePerson?: boolean,
): Promise<PaymentConfirmResult> {
  return requireFinanceApi().confirmPayment(id, expectedVersion, confirmSinglePerson);
}
export async function voidPayment(
  id: string,
  expectedVersion: number,
  reason?: string,
): Promise<PaymentDoc> {
  return requireFinanceApi().voidPayment(id, expectedVersion, reason);
}

// --- Cashier fund execution (T-012 Phase 4, D4 货币资金结算/出纳执行) ---

/** Fund-execution tasks over a posted voucher's cash/bank lines (empty in demo mode). */
export async function listFundConsumptions(filters?: {
  voucherId?: string;
  executionStatus?: FundExecutionStatus;
  reconciliationStatus?: FundReconciliationStatus;
  period?: string;
  limit?: number;
  cursor?: string;
}): Promise<readonly FundConsumption[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listFundConsumptions(filters);
}

/** Open fund-execution workload (queue badge / dashboard; 0 in demo mode). */
export async function getFundConsumptionPendingCount(): Promise<number> {
  const api = getFinanceApi();
  if (!api) return 0;
  return (await api.getFundConsumptionPendingCount()).count;
}

/** A single fund-consumption row, or `null` (not found / demo mode). */
export async function getFundConsumption(id: string): Promise<FundConsumption | null> {
  const api = getFinanceApi();
  if (!api) return null;
  try {
    return await api.getFundConsumption(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Record fund movement (executed | skipped) + close the paired task. No voucher. */
export async function consumeFundConsumption(
  id: string,
  input: ConsumeFundConsumption,
): Promise<FundConsumption> {
  return requireFinanceApi().consumeFundConsumption(id, input);
}

/** Attach a bank receipt to a fund line (T-014). Requires the backend. */
export async function uploadFundReceipt(
  id: string,
  input: UploadFundReceipt,
): Promise<FundConsumption> {
  return requireFinanceApi().uploadFundReceipt(id, input);
}

// --- Contracts / 交易生命周期 (T-005) ---

/** Contracts for a view (empty in demo mode). */
export async function listContracts(filters?: {
  status?: ContractStatus;
  type?: ContractType;
  partnerId?: string;
}): Promise<readonly Contract[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listContracts(filters);
}

/** A single contract, or `null` (not found / demo mode). */
export async function getContract(id: string): Promise<Contract | null> {
  const api = getFinanceApi();
  if (!api) return null;
  try {
    return await api.getContract(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** The contract timeline (event ∪ vouchers ∪ payments), or `null`. */
export async function getContractTimeline(id: string): Promise<ContractTimeline | null> {
  const api = getFinanceApi();
  if (!api) return null;
  try {
    return await api.getContractTimeline(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Create a contract draft. Requires the backend. */
export async function createContract(input: CreateContract): Promise<Contract> {
  return requireFinanceApi().createContract(input);
}

/** Update a contract (status/fields; version-guarded). Requires the backend. */
export async function updateContract(
  id: string,
  input: { expectedVersion: number; status?: ContractStatus },
): Promise<Contract> {
  return requireFinanceApi().updateContract(id, input);
}

// --- Business partners / 往来单位 (T-012) ---

/** Partner master for pickers/lists (empty in demo mode). */
export async function listBusinessPartners(filters?: {
  active?: boolean;
  partyType?: PartnerPartyType;
  role?: PartnerRole;
  q?: string;
}): Promise<readonly BusinessPartner[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listBusinessPartners(filters);
}

/** A single partner, or `null` (not found / demo mode). */
export async function getBusinessPartner(id: string): Promise<BusinessPartner | null> {
  const api = getFinanceApi();
  if (!api) return null;
  try {
    return await api.getBusinessPartner(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Create a partner (org-entered; D2 confirmation applies). Requires the backend. */
export async function createBusinessPartner(input: CreateBusinessPartner): Promise<BusinessPartner> {
  return requireFinanceApi().createBusinessPartner(input);
}

/** Update / deactivate a partner (version-guarded). Requires the backend. */
export async function updateBusinessPartner(
  id: string,
  input: UpdateBusinessPartner,
): Promise<BusinessPartner> {
  return requireFinanceApi().updateBusinessPartner(id, input);
}

/** Org roster — employee quick-select for individual partners (empty in demo mode). */
export async function listMembers(): Promise<readonly Membership[]> {
  const api = getFinanceApi();
  if (!api) return [];
  return api.listMembers();
}

/**
 * The caller's accounting capability (T-012 Phase 3, D8). In demo mode (no backend)
 * default to `true` so the full form is shown; the API still enforces the fork.
 */
export async function getAccountingCapable(): Promise<boolean> {
  const api = getFinanceApi();
  if (!api) return true;
  try {
    return (await api.getMe()).accountingCapable;
  } catch {
    return true;
  }
}

// --- Account display preferences + standard chart v2 (T-012 Phase 2) ---

const EMPTY_PREFERENCES: AccountPreferences = { recommended: [], pinned: [], hidden: [] };

/** Merged picker preferences: ledger default + personal (empty in demo mode). */
export async function getAccountPreferences(): Promise<AccountPreferences> {
  const api = getFinanceApi();
  if (!api) return EMPTY_PREFERENCES;
  return api.getAccountPreferences();
}

/** Update the caller's personal pinned/hidden lists. Requires the backend. */
export async function updateAccountPreferences(body: {
  pinned?: string[];
  hidden?: string[];
}): Promise<AccountPreferences> {
  return requireFinanceApi().updateAccountPreferences(body);
}

/** Update the team's recommended list (accounting/admin). Requires the backend. */
export async function updateLedgerAccountDefaults(
  recommended: string[],
): Promise<AccountPreferences> {
  return requireFinanceApi().updateLedgerAccountDefaults(recommended);
}

/** Preview standard chart v2 additions for this ledger (`null` in demo mode). */
export async function getStandardChartDiff(): Promise<StandardChartDiff | null> {
  const api = getFinanceApi();
  if (!api) return null;
  return api.getStandardChartDiff();
}

/** Apply the explicit additive standard-chart import (D6). Requires the backend. */
export async function importStandardChart(): Promise<StandardChartImportResult> {
  return requireFinanceApi().importStandardChart();
}
