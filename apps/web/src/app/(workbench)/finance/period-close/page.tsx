import { getPeriodReadiness, listPeriods } from '@/lib/finance/data-source';
import { PeriodCloseList } from './period-close-client';

export const dynamic = 'force-dynamic';

/**
 * 期末结账对象列表：每个会计期间是一行可进入的关账对象。
 */
export default async function PeriodClosePage() {
  const period = new Date().toISOString().slice(0, 7);
  const [readiness, periods] = await Promise.all([getPeriodReadiness(period), listPeriods()]);

  return <PeriodCloseList period={period} readiness={readiness} periods={periods} />;
}
