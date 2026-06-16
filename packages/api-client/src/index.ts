/**
 * @my-erp/api-client — typed client for the My-ERP `/v1` API.
 *
 * Types are GENERATED from the OpenAPI contract (`docs/context/api/openapi.yaml`)
 * into `./generated/schema.ts` via `pnpm --filter @my-erp/api-client codegen`.
 * The runtime is a thin fetch wrapper; the bearer token carries the active
 * org + ledger scope (the API's AuthGuard/LedgerScopeGuard read it from the
 * token), so callers supply only a base URL and a token.
 */
import type { components } from './generated/schema';

export type Account = components['schemas']['Account'];
export type Voucher = components['schemas']['Voucher'];
export type VoucherLine = components['schemas']['VoucherLine'];
export type CreateVoucher = components['schemas']['CreateVoucher'];
export type VoucherStatus = Voucher['status'];
export type Intake = components['schemas']['Intake'];
export type CaptureIntake = components['schemas']['CaptureIntake'];
export type ExtractionResult = components['schemas']['ExtractionResult'];
// Reports (T-006 M3c)
export type ReportLine = components['schemas']['ReportLine'];
export type BalanceSheet = components['schemas']['BalanceSheet'];
export type IncomeStatement = components['schemas']['IncomeStatement'];
export type CashFlowStatement = components['schemas']['CashFlowStatement'];
// Period close (T-006 M3a)
export type PeriodClose = components['schemas']['PeriodClose'];
export type PeriodCloseReadiness = components['schemas']['PeriodCloseReadiness'];
export type PeriodCloseResult = components['schemas']['PeriodCloseResult'];
// Cash-flow tagging (T-006 M3b)
export type CashFlowItem = components['schemas']['CashFlowItem'];
export type CashFlowTieOut = components['schemas']['CashFlowTieOut'];
export type UntaggedCashLine = components['schemas']['UntaggedCashLine'];

/** Kept for back-compat with the previous package stub. */
export const API_CLIENT_PACKAGE = '@my-erp/api-client' as const;

export interface ApiClientConfig {
  /** Base URL of the API, e.g. `http://localhost:8000`. */
  readonly baseUrl: string;
  /** Bearer token; encodes the active org + ledger scope. */
  readonly token: string;
  /** Override fetch (tests / non-global runtimes). Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
}

/** A non-2xx response from the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
    readonly path: string,
  ) {
    super(`API ${status} ${statusText} for ${path}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
  }
}

/** The subset of `/v1` the web workbench needs for the voucher fast-entry slice (T-004 S1). */
export interface ApiClient {
  listVouchers(params?: { status?: VoucherStatus }): Promise<Voucher[]>;
  getVoucher(id: string): Promise<Voucher>;
  createVoucher(body: CreateVoucher): Promise<Voucher>;
  updateVoucher(id: string, body: CreateVoucher): Promise<Voucher>;
  submitVoucher(id: string): Promise<Voucher>;
  postVoucher(id: string, body?: { confirmSinglePerson?: boolean }): Promise<Voucher>;
  listAccounts(): Promise<Account[]>;
  listIntakes(params?: { status?: string }): Promise<Intake[]>;
  getIntake(id: string): Promise<Intake>;
  captureIntake(body: CaptureIntake): Promise<Intake>;
  extractIntake(id: string): Promise<Intake>;
  draftIntake(id: string): Promise<Intake>;
  discardIntake(id: string): Promise<Intake>;
  // Statutory reports — BS as-of date; IS/CF over a [from,to] range (T-006 M3c).
  balanceSheet(to: string): Promise<BalanceSheet>;
  incomeStatement(from: string, to: string): Promise<IncomeStatement>;
  cashFlowStatement(from: string, to: string): Promise<CashFlowStatement>;
  // Period close (T-006 M3a).
  listPeriods(): Promise<PeriodClose[]>;
  periodReadiness(period: string): Promise<PeriodCloseReadiness>;
  closePeriod(period: string): Promise<PeriodCloseResult>;
  reopenPeriod(period: string): Promise<PeriodClose>;
  // Cash-flow tagging (T-006 M3b).
  listCashFlowItems(): Promise<CashFlowItem[]>;
  seedCashFlowItems(): Promise<{ seeded: number }>;
  untaggedCashFlows(period?: string): Promise<UntaggedCashLine[]>;
  cashFlowTieOut(params?: { from?: string; to?: string }): Promise<CashFlowTieOut>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const doFetch = config.fetch ?? globalThis.fetch;
  const base = config.baseUrl.replace(/\/$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, res.statusText, text, path);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    listVouchers: (params) =>
      request<Voucher[]>(
        'GET',
        `/v1/vouchers${params?.status ? `?status=${params.status}` : ''}`,
      ),
    getVoucher: (id) => request<Voucher>('GET', `/v1/vouchers/${encodeURIComponent(id)}`),
    createVoucher: (body) => request<Voucher>('POST', '/v1/vouchers', body),
    updateVoucher: (id, body) =>
      request<Voucher>('PATCH', `/v1/vouchers/${encodeURIComponent(id)}`, body),
    submitVoucher: (id) =>
      request<Voucher>('POST', `/v1/vouchers/${encodeURIComponent(id)}/submit`),
    postVoucher: (id, body) =>
      request<Voucher>('POST', `/v1/vouchers/${encodeURIComponent(id)}/post`, body ?? {}),
    listAccounts: () => request<Account[]>('GET', '/v1/accounts'),
    listIntakes: (params) =>
      request<Intake[]>('GET', `/v1/intakes${params?.status ? `?status=${params.status}` : ''}`),
    getIntake: (id) => request<Intake>('GET', `/v1/intakes/${encodeURIComponent(id)}`),
    captureIntake: (body) => request<Intake>('POST', '/v1/intakes', body),
    extractIntake: (id) =>
      request<Intake>('POST', `/v1/intakes/${encodeURIComponent(id)}/extract`),
    draftIntake: (id) => request<Intake>('POST', `/v1/intakes/${encodeURIComponent(id)}/draft`),
    discardIntake: (id) =>
      request<Intake>('POST', `/v1/intakes/${encodeURIComponent(id)}/discard`),
    balanceSheet: (to) =>
      request<BalanceSheet>('GET', `/v1/reports/balance-sheet?to=${encodeURIComponent(to)}`),
    incomeStatement: (from, to) =>
      request<IncomeStatement>(
        'GET',
        `/v1/reports/income-statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    cashFlowStatement: (from, to) =>
      request<CashFlowStatement>(
        'GET',
        `/v1/reports/cash-flow?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    listPeriods: () => request<PeriodClose[]>('GET', '/v1/periods'),
    periodReadiness: (period) =>
      request<PeriodCloseReadiness>('GET', `/v1/periods/${encodeURIComponent(period)}/readiness`),
    closePeriod: (period) =>
      request<PeriodCloseResult>('POST', `/v1/periods/${encodeURIComponent(period)}/close`),
    reopenPeriod: (period) =>
      request<PeriodClose>('POST', `/v1/periods/${encodeURIComponent(period)}/reopen`),
    listCashFlowItems: () => request<CashFlowItem[]>('GET', '/v1/cash-flow-items'),
    seedCashFlowItems: () =>
      request<{ seeded: number }>('POST', '/v1/cash-flow-items/seed-standard'),
    untaggedCashFlows: (period) =>
      request<UntaggedCashLine[]>(
        'GET',
        `/v1/cash-flow/untagged${period ? `?period=${encodeURIComponent(period)}` : ''}`,
      ),
    cashFlowTieOut: (params) => {
      const qs = new URLSearchParams();
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      const q = qs.toString();
      return request<CashFlowTieOut>('GET', `/v1/cash-flow/tie-out${q ? `?${q}` : ''}`);
    },
  };
}
