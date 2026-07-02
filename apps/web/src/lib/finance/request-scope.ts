/**
 * Resolves the finance `/v1` client for the current request, or `null` when the
 * backend is not configured (then the data-source falls back to demo fixtures).
 *
 * Runs server-side only. The bearer token carries the active org + ledger scope.
 * In production, expose it as `API_DEV_TOKEN`; in local dev, `AUTH_DEV_SECRET`
 * can mint the seeded dev org/ledger token automatically.
 */
import { createApiClient, type ApiClient } from '@my-erp/api-client';
import { createHmac } from 'node:crypto';

const DEV_USER_ID = 'dev-user';
const DEV_ORG_ID = '11111111-1111-1111-1111-111111111111';
const DEV_LEDGER_BOOK_ID = '22222222-2222-2222-2222-222222222222';

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function mintLocalDevToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    sub: DEV_USER_ID,
    orgId: DEV_ORG_ID,
    ledgerBookId: DEV_LEDGER_BOOK_ID,
    iat: now,
    exp: now + 60 * 60,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function resolveApiToken(): string | undefined {
  if (process.env.API_DEV_TOKEN) return process.env.API_DEV_TOKEN;
  if (process.env.NODE_ENV === 'production') return undefined;
  const secret = process.env.AUTH_DEV_SECRET;
  return secret ? mintLocalDevToken(secret) : undefined;
}

/** The client when `API_BASE_URL` + an explicit or local-dev token are set, else `null`. */
export function getFinanceApi(): ApiClient | null {
  const baseUrl = process.env.API_BASE_URL;
  const token = resolveApiToken();
  if (!baseUrl || !token) return null;
  return createApiClient({ baseUrl, token });
}

/** Like {@link getFinanceApi} but throws when unconfigured — for mutations that cannot demo. */
export function requireFinanceApi(): ApiClient {
  const api = getFinanceApi();
  if (!api) {
    throw new Error(
      'finance API not configured: set API_BASE_URL and API_DEV_TOKEN, or AUTH_DEV_SECRET in local dev, to enable writes',
    );
  }
  return api;
}
