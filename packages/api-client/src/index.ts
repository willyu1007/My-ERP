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
  };
}
