import { StatusBadge, Section } from '@my-erp/ui';

type Health = { status: string; service: string; time: string };

async function getHealth(): Promise<Health | null> {
  const base = process.env.API_BASE_URL ?? 'http://localhost:8000';
  try {
    const res = await fetch(`${base}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const health = await getHealth();
  const ok = health?.status === 'ok';

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">系统 · 健康检查</h1>
        <p className="wb-muted">api 探活（含数据库 ping）。</p>
      </div>

      <Section title="API health">
        <div className="wb-row">
          <StatusBadge
            tone={ok ? 'success' : 'danger'}
            dot
            label={health ? `${health.status} · ${health.service}` : 'api 不可达'}
          />
          {health && <span className="wb-mono wb-muted">{health.time}</span>}
        </div>
        {!health && (
          <p className="wb-muted">
            请先启动 api：<code className="wb-mono">pnpm --filter @my-erp/api dev</code>
          </p>
        )}
      </Section>
    </div>
  );
}
