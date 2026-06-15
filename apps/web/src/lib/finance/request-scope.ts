/**
 * Resolves the finance `/v1` client for the current request, or `null` when the
 * backend is not configured (then the data-source falls back to demo fixtures).
 *
 * Runs server-side only. The bearer token carries the active org + ledger scope;
 * mint a dev token with `signDevToken({ userId, orgId, ledgerBookId }, AUTH_DEV_SECRET)`
 * from `@my-erp/platform` and expose it as `API_DEV_TOKEN`. Seed accounts via
 * `POST /v1/accounts/seed-standard` before expecting non-empty results.
 */
import { createApiClient, type ApiClient } from '@my-erp/api-client';

/** The client when `API_BASE_URL` + `API_DEV_TOKEN` are set, else `null` (fixtures). */
export function getFinanceApi(): ApiClient | null {
  const baseUrl = process.env.API_BASE_URL;
  const token = process.env.API_DEV_TOKEN;
  if (!baseUrl || !token) return null;
  return createApiClient({ baseUrl, token });
}

/** Like {@link getFinanceApi} but throws when unconfigured — for mutations that cannot demo. */
export function requireFinanceApi(): ApiClient {
  const api = getFinanceApi();
  if (!api) {
    throw new Error(
      'finance API not configured: set API_BASE_URL and API_DEV_TOKEN to enable writes',
    );
  }
  return api;
}
