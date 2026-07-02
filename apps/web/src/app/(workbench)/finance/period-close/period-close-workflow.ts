import type { PeriodCloseReadiness } from '@my-erp/api-client';

export type PeriodWorkflowKey = 'checks' | 'cash-flow' | 'preview' | 'close';

export const PERIOD_WORKFLOWS: readonly PeriodWorkflowKey[] = [
  'checks',
  'cash-flow',
  'preview',
  'close',
];

export function isPeriodWorkflow(value: string): value is PeriodWorkflowKey {
  return PERIOD_WORKFLOWS.includes(value as PeriodWorkflowKey);
}

export function periodHardBlockerCount(readiness: PeriodCloseReadiness | null): number {
  if (!readiness || readiness.status === 'closed') return 0;
  return readiness.unpostedCount + readiness.unclosedPriorPeriods.length;
}

export function nextPeriodWorkflow(readiness: PeriodCloseReadiness | null): PeriodWorkflowKey {
  if (!readiness) return 'checks';
  if (readiness.status === 'closed') return 'close';
  if (periodHardBlockerCount(readiness) > 0) return 'checks';
  if (readiness.untaggedCashFlowCount > 0) return 'cash-flow';
  return 'preview';
}
