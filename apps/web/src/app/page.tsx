import { Badge } from '@my-erp/ui';

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

export default async function Page() {
  const health = await getHealth();
  const ok = health?.status === 'ok';

  return (
    <main className="wb-content">
      <div className="wb-scene wb-stack wb-stack--lg">
        <div className="wb-stack">
          <h1 className="wb-section__title">morethan · my-erp</h1>
          <p className="wb-muted">
            财务后台骨架。会计总账核心（科目 / 凭证 / 过账 / 账簿）与角色工作台将在后续阶段落地。
          </p>
        </div>

        <section className="wb-section">
          <div className="wb-section__head">
            <h2 className="wb-section__title">API health</h2>
          </div>
          <div className="wb-row">
            <Badge tone={ok ? 'success' : 'danger'} dot>
              {health ? `${health.status} · ${health.service}` : 'api 不可达'}
            </Badge>
            {health && <span className="wb-mono wb-muted">{health.time}</span>}
          </div>
          {!health && (
            <p className="wb-muted">
              请先启动 api：<code className="wb-mono">pnpm --filter @my-erp/api dev</code>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
