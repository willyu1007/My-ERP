import {
  getPeriodReadiness,
  getUntaggedCashFlows,
  listAccounts,
  listCashFlowItems,
  listPeriods,
} from '@/lib/finance/data-source';
import { CashFlowWorklist } from './cash-flow-worklist';
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

  const [readiness, periods, untagged, cashFlowItems, accounts] = await Promise.all([
    getPeriodReadiness(period),
    listPeriods(),
    getUntaggedCashFlows(period),
    listCashFlowItems(),
    listAccounts(),
  ]);
  const defaults: Record<string, string> = {};
  for (const a of accounts) if (a.defaultCashFlowItem) defaults[a.code] = a.defaultCashFlowItem;

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <PeriodCloseClient period={period} readiness={readiness} periods={periods} />

      {untagged.length > 0 && (
        <CashFlowWorklist lines={untagged} cashFlowItems={cashFlowItems} defaults={defaults} />
      )}
    </div>
  );
}
