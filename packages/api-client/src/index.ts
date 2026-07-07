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
export type TrialBalance = components['schemas']['TrialBalance'];
export type AccountLedger = components['schemas']['AccountLedger'];
export type Voucher = components['schemas']['Voucher'];
export type VoucherLine = components['schemas']['VoucherLine'];
export type CreateVoucher = components['schemas']['CreateVoucher'];
export type VoucherStatus = Voucher['status'];
export type Intake = components['schemas']['Intake'];
export type CaptureIntake = components['schemas']['CaptureIntake'];
export type ExtractionResult = components['schemas']['ExtractionResult'];
// Task kernel (T-003 R2)
export type WorkItem = components['schemas']['WorkItem'];
export type WorkItemAction = components['schemas']['WorkItemAction'];
export type WorkItemStatus = components['schemas']['WorkItemStatus'];
export type WorkItemActionRequest = components['schemas']['WorkItemActionRequest'];
export type WorkItemView =
  | 'my_tasks'
  | 'role_queue'
  | 'created_by_me'
  | 'handled_by_me'
  | 'supervision'
  | 'audit_readonly';
// Cashier payments (T-007) + enrichment (T-012 Phase 3)
export type PaymentDoc = components['schemas']['PaymentDoc'];
export type CreatePayment = components['schemas']['CreatePayment'];
export type EnrichPayment = components['schemas']['EnrichPayment'];
export type PaymentConfirmResult = components['schemas']['PaymentConfirmResult'];
export type PaymentDirection = PaymentDoc['direction'];
export type PaymentStatus = PaymentDoc['status'];
// Cashier fund execution (T-012 Phase 4, D4)
export type FundConsumption = components['schemas']['FundConsumption'];
export type ConsumeFundConsumption = components['schemas']['ConsumeFundConsumption'];
export type FundExecutionStatus = FundConsumption['executionStatus'];
export type FundReconciliationStatus = FundConsumption['reconciliationStatus'];
// Contracts (T-005)
export type Contract = components['schemas']['Contract'];
export type CreateContract = components['schemas']['CreateContract'];
export type UpdateContract = components['schemas']['UpdateContract'];
export type ContractStatus = Contract['status'];
export type ContractType = Contract['type'];
export type ContractTimeline = components['schemas']['ContractTimeline'];
export type TimelineItem = components['schemas']['TimelineItem'];
// Business partners (T-012)
export type BusinessPartner = components['schemas']['BusinessPartner'];
export type CreateBusinessPartner = components['schemas']['CreateBusinessPartner'];
export type UpdateBusinessPartner = components['schemas']['UpdateBusinessPartner'];
export type PartnerPartyType = BusinessPartner['partyType'];
export type PartnerRole = BusinessPartner['roles'][number];
export type Membership = components['schemas']['Membership'];
export type Me = components['schemas']['Me'];
// Standard chart v2 + display preferences (T-012 Phase 2)
export type StandardChartDiff = components['schemas']['StandardChartDiff'];
export type StandardChartImportResult = components['schemas']['StandardChartImportResult'];
export type AccountPreferences = components['schemas']['AccountPreferences'];
/** Result of a work-item action: the updated item, plus the source entity for `complete`. */
export interface WorkItemActionResult {
  readonly workItem: WorkItem;
  readonly source?: Voucher;
}
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
export type TagCashFlow = components['schemas']['TagCashFlow'];

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
  trialBalance(params?: { period?: string }): Promise<TrialBalance>;
  accountLedger(code: string, params?: { period?: string }): Promise<AccountLedger>;
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
  tagCashFlow(body: TagCashFlow): Promise<{ tagged: number }>;
  // Task kernel (T-003 R2) — visibility + backend-authorized actions.
  listWorkItems(params?: {
    view?: WorkItemView;
    status?: WorkItemStatus;
    sourceType?: string;
    sourceId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<WorkItem[]>;
  getWorkItem(id: string): Promise<WorkItem>;
  actOnWorkItem(
    id: string,
    actionKey: WorkItemAction,
    body: WorkItemActionRequest,
  ): Promise<WorkItemActionResult>;
  // Cashier payments (T-007).
  listPayments(params?: {
    status?: PaymentStatus;
    direction?: PaymentDirection;
    partnerId?: string;
  }): Promise<PaymentDoc[]>;
  getPayment(id: string): Promise<PaymentDoc>;
  createPayment(body: CreatePayment): Promise<PaymentDoc>;
  enrichPayment(id: string, body: EnrichPayment): Promise<PaymentDoc>;
  submitPayment(id: string, expectedVersion: number): Promise<PaymentDoc>;
  approvePayment(id: string, expectedVersion: number): Promise<PaymentDoc>;
  confirmPayment(
    id: string,
    expectedVersion: number,
    confirmSinglePerson?: boolean,
  ): Promise<PaymentConfirmResult>;
  voidPayment(id: string, expectedVersion: number, reason?: string): Promise<PaymentDoc>;
  // Cashier fund execution (T-012 Phase 4, D4; queue filters T-013).
  listFundConsumptions(params?: {
    voucherId?: string;
    executionStatus?: FundExecutionStatus;
    reconciliationStatus?: FundReconciliationStatus;
    period?: string;
    limit?: number;
    cursor?: string;
  }): Promise<FundConsumption[]>;
  getFundConsumption(id: string): Promise<FundConsumption>;
  getFundConsumptionPendingCount(): Promise<{ count: number }>;
  consumeFundConsumption(id: string, body: ConsumeFundConsumption): Promise<FundConsumption>;
  // Contracts (T-005).
  listContracts(params?: {
    status?: ContractStatus;
    type?: ContractType;
    partnerId?: string;
  }): Promise<Contract[]>;
  getContract(id: string): Promise<Contract>;
  createContract(body: CreateContract): Promise<Contract>;
  updateContract(id: string, body: UpdateContract): Promise<Contract>;
  getContractTimeline(id: string): Promise<ContractTimeline>;
  // Business partners (T-012).
  listBusinessPartners(params?: {
    active?: boolean;
    partyType?: PartnerPartyType;
    role?: PartnerRole;
    q?: string;
  }): Promise<BusinessPartner[]>;
  getBusinessPartner(id: string): Promise<BusinessPartner>;
  createBusinessPartner(body: CreateBusinessPartner): Promise<BusinessPartner>;
  updateBusinessPartner(id: string, body: UpdateBusinessPartner): Promise<BusinessPartner>;
  /** Org roster — employee quick-select for individual partners (T-012 D2). */
  listMembers(): Promise<Membership[]>;
  /** The caller's own identity + capabilities (T-012 Phase 3). */
  getMe(): Promise<Me>;
  // Standard chart v2 + display preferences (T-012 Phase 2).
  getStandardChartDiff(): Promise<StandardChartDiff>;
  importStandardChart(): Promise<StandardChartImportResult>;
  getAccountPreferences(): Promise<AccountPreferences>;
  updateAccountPreferences(body: {
    pinned?: string[];
    hidden?: string[];
  }): Promise<AccountPreferences>;
  updateLedgerAccountDefaults(recommended: string[]): Promise<AccountPreferences>;
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

  function qs(params?: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `?${query}` : '';
  }

  return {
    listVouchers: (params) =>
      request<Voucher[]>('GET', `/v1/vouchers${params?.status ? `?status=${params.status}` : ''}`),
    getVoucher: (id) => request<Voucher>('GET', `/v1/vouchers/${encodeURIComponent(id)}`),
    createVoucher: (body) => request<Voucher>('POST', '/v1/vouchers', body),
    updateVoucher: (id, body) =>
      request<Voucher>('PATCH', `/v1/vouchers/${encodeURIComponent(id)}`, body),
    submitVoucher: (id) =>
      request<Voucher>('POST', `/v1/vouchers/${encodeURIComponent(id)}/submit`),
    postVoucher: (id, body) =>
      request<Voucher>('POST', `/v1/vouchers/${encodeURIComponent(id)}/post`, body ?? {}),
    listAccounts: () => request<Account[]>('GET', '/v1/accounts'),
    trialBalance: (params) => request<TrialBalance>('GET', `/v1/ledger/trial-balance${qs(params)}`),
    accountLedger: (code, params) =>
      request<AccountLedger>('GET', `/v1/ledger/accounts/${encodeURIComponent(code)}${qs(params)}`),
    listIntakes: (params) =>
      request<Intake[]>('GET', `/v1/intakes${params?.status ? `?status=${params.status}` : ''}`),
    getIntake: (id) => request<Intake>('GET', `/v1/intakes/${encodeURIComponent(id)}`),
    captureIntake: (body) => request<Intake>('POST', '/v1/intakes', body),
    extractIntake: (id) => request<Intake>('POST', `/v1/intakes/${encodeURIComponent(id)}/extract`),
    draftIntake: (id) => request<Intake>('POST', `/v1/intakes/${encodeURIComponent(id)}/draft`),
    discardIntake: (id) => request<Intake>('POST', `/v1/intakes/${encodeURIComponent(id)}/discard`),
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
    tagCashFlow: (body) => request<{ tagged: number }>('POST', '/v1/cash-flow/tag', body),
    listWorkItems: (params) => {
      const qs = new URLSearchParams();
      if (params?.view) qs.set('view', params.view);
      if (params?.status) qs.set('status', params.status);
      if (params?.sourceType) qs.set('sourceType', params.sourceType);
      if (params?.sourceId) qs.set('sourceId', params.sourceId);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      const q = qs.toString();
      return request<WorkItem[]>('GET', `/v1/work-items${q ? `?${q}` : ''}`);
    },
    getWorkItem: (id) => request<WorkItem>('GET', `/v1/work-items/${encodeURIComponent(id)}`),
    actOnWorkItem: (id, actionKey, body) =>
      request<WorkItemActionResult>(
        'POST',
        `/v1/work-items/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionKey)}`,
        body,
      ),
    listPayments: (params) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.direction) qs.set('direction', params.direction);
      if (params?.partnerId) qs.set('partnerId', params.partnerId);
      const q = qs.toString();
      return request<PaymentDoc[]>('GET', `/v1/payments${q ? `?${q}` : ''}`);
    },
    getPayment: (id) => request<PaymentDoc>('GET', `/v1/payments/${encodeURIComponent(id)}`),
    createPayment: (body) => request<PaymentDoc>('POST', '/v1/payments', body),
    enrichPayment: (id, body) =>
      request<PaymentDoc>('POST', `/v1/payments/${encodeURIComponent(id)}/enrich`, body),
    submitPayment: (id, expectedVersion) =>
      request<PaymentDoc>('POST', `/v1/payments/${encodeURIComponent(id)}/submit`, {
        expectedVersion,
      }),
    approvePayment: (id, expectedVersion) =>
      request<PaymentDoc>('POST', `/v1/payments/${encodeURIComponent(id)}/approve`, {
        expectedVersion,
      }),
    confirmPayment: (id, expectedVersion, confirmSinglePerson) =>
      request<PaymentConfirmResult>('POST', `/v1/payments/${encodeURIComponent(id)}/confirm`, {
        expectedVersion,
        ...(confirmSinglePerson ? { confirmSinglePerson } : {}),
      }),
    voidPayment: (id, expectedVersion, reason) =>
      request<PaymentDoc>('POST', `/v1/payments/${encodeURIComponent(id)}/void`, {
        expectedVersion,
        ...(reason ? { reason } : {}),
      }),
    listFundConsumptions: (params) => {
      const qs = new URLSearchParams();
      if (params?.voucherId) qs.set('voucherId', params.voucherId);
      if (params?.executionStatus) qs.set('executionStatus', params.executionStatus);
      if (params?.reconciliationStatus)
        qs.set('reconciliationStatus', params.reconciliationStatus);
      if (params?.period) qs.set('period', params.period);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      const q = qs.toString();
      return request<FundConsumption[]>('GET', `/v1/fund-consumptions${q ? `?${q}` : ''}`);
    },
    getFundConsumption: (id) =>
      request<FundConsumption>('GET', `/v1/fund-consumptions/${encodeURIComponent(id)}`),
    getFundConsumptionPendingCount: () =>
      request<{ count: number }>('GET', '/v1/fund-consumptions/pending-count'),
    consumeFundConsumption: (id, body) =>
      request<FundConsumption>(
        'POST',
        `/v1/fund-consumptions/${encodeURIComponent(id)}/consume`,
        body,
      ),
    listContracts: (params) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.type) qs.set('type', params.type);
      if (params?.partnerId) qs.set('partnerId', params.partnerId);
      const q = qs.toString();
      return request<Contract[]>('GET', `/v1/contracts${q ? `?${q}` : ''}`);
    },
    getContract: (id) => request<Contract>('GET', `/v1/contracts/${encodeURIComponent(id)}`),
    createContract: (body) => request<Contract>('POST', '/v1/contracts', body),
    updateContract: (id, body) =>
      request<Contract>('PATCH', `/v1/contracts/${encodeURIComponent(id)}`, body),
    getContractTimeline: (id) =>
      request<ContractTimeline>('GET', `/v1/contracts/${encodeURIComponent(id)}/timeline`),
    listBusinessPartners: (params) => {
      const qs = new URLSearchParams();
      if (params?.active !== undefined) qs.set('active', String(params.active));
      if (params?.partyType) qs.set('partyType', params.partyType);
      if (params?.role) qs.set('role', params.role);
      if (params?.q) qs.set('q', params.q);
      const q = qs.toString();
      return request<BusinessPartner[]>('GET', `/v1/business-partners${q ? `?${q}` : ''}`);
    },
    getBusinessPartner: (id) =>
      request<BusinessPartner>('GET', `/v1/business-partners/${encodeURIComponent(id)}`),
    createBusinessPartner: (body) =>
      request<BusinessPartner>('POST', '/v1/business-partners', body),
    updateBusinessPartner: (id, body) =>
      request<BusinessPartner>('PATCH', `/v1/business-partners/${encodeURIComponent(id)}`, body),
    listMembers: () => request<Membership[]>('GET', '/v1/members'),
    getMe: () => request<Me>('GET', '/v1/me'),
    getStandardChartDiff: () => request<StandardChartDiff>('GET', '/v1/accounts/standard-diff'),
    importStandardChart: () =>
      request<StandardChartImportResult>('POST', '/v1/accounts/import-standard'),
    getAccountPreferences: () => request<AccountPreferences>('GET', '/v1/account-preferences'),
    updateAccountPreferences: (body) =>
      request<AccountPreferences>('PATCH', '/v1/account-preferences', body),
    updateLedgerAccountDefaults: (recommended) =>
      request<AccountPreferences>('PATCH', '/v1/account-preferences/ledger-default', {
        recommended,
      }),
  };
}
