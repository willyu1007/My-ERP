import { getPeriodReadiness, listPeriods } from '@/lib/finance/data-source';
import { PeriodCloseClient } from './period-close-client';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 期末结账 (T-006 M3a UI) — close-readiness for a chosen period, 结账 (结转损益 + lock)
 * / 反结账 (红冲 + reopen), and the ledger's close history. Readiness comes from the
 * backend; in demo mode the panel renders empty (mutations need the backend).
 */
export default async function PeriodClosePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = first(sp.period);
  const period = raw && PERIOD_RE.test(raw) ? raw : new Date().toISOString().slice(0, 7);

  const [readiness, periods] = await Promise.all([getPeriodReadiness(period), listPeriods()]);

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">期末结账</h1>
        <p className="wb-muted">
          结转损益至本年利润、锁定会计期间；如需更正可反结账（红冲结转凭证）。
        </p>
      </div>

      <PeriodCloseClient period={period} readiness={readiness} periods={periods} />
    </div>
  );
}
