import { notFound } from 'next/navigation';
import {
  getPeriodReadiness,
  getUntaggedCashFlows,
  listAccounts,
  listCashFlowItems,
} from '@/lib/finance/data-source';
import { CashFlowWorklist } from '../../cash-flow-worklist';
import { PeriodCloseWorkflow, type PeriodWorkflowKey } from '../../period-close-client';

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const WORKFLOWS: readonly PeriodWorkflowKey[] = ['checks', 'cash-flow', 'close'];

function isWorkflow(value: string): value is PeriodWorkflowKey {
  return WORKFLOWS.includes(value as PeriodWorkflowKey);
}

export default async function PeriodCloseWorkflowPage({
  params,
}: {
  readonly params: Promise<{
    readonly period: string;
    readonly workflow: string;
  }>;
}) {
  const { period, workflow } = await params;
  if (!PERIOD_RE.test(period) || !isWorkflow(workflow)) notFound();

  const readiness = await getPeriodReadiness(period);

  if (workflow !== 'cash-flow') {
    return <PeriodCloseWorkflow period={period} readiness={readiness} workflow={workflow} />;
  }

  const [untagged, cashFlowItems, accounts] = await Promise.all([
    getUntaggedCashFlows(period),
    listCashFlowItems(),
    listAccounts(),
  ]);
  const defaults: Record<string, string> = {};
  for (const account of accounts) {
    if (account.defaultCashFlowItem) defaults[account.code] = account.defaultCashFlowItem;
  }

  return (
    <PeriodCloseWorkflow
      period={period}
      readiness={readiness}
      workflow={workflow}
      cashFlowWorklist={
        untagged.length > 0 ? (
          <CashFlowWorklist lines={untagged} cashFlowItems={cashFlowItems} defaults={defaults} />
        ) : null
      }
    />
  );
}
