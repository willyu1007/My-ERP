import { resolveApiEndpoint } from '@/lib/finance/request-scope';

/**
 * 回单查看代理 (T-014). Streams a fund line's bank-receipt bytes from the `/v1` API to the
 * browser, so an <img>/tab can render it without exposing the bearer token client-side.
 * The receipt is sensitive financial detail — it stays inside My-ERP (no ecosystem leak),
 * and this route never caches it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cfg = resolveApiEndpoint();
  if (!cfg) return new Response('后端未配置', { status: 503 });

  const upstream = await fetch(
    `${cfg.baseUrl}/v1/fund-consumptions/${encodeURIComponent(id)}/attachment`,
    { headers: { Authorization: `Bearer ${cfg.token}` }, cache: 'no-store' },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response('回单不可用', { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  });
}
