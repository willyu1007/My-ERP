import { notFound } from 'next/navigation';
import { getPeriodReadiness } from '@/lib/finance/data-source';
import { PeriodCloseOverview } from '../period-close-client';

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PeriodCloseOverviewPage({
  params,
}: {
  readonly params: Promise<{ readonly period: string }>;
}) {
  const { period } = await params;
  if (!PERIOD_RE.test(period)) notFound();

  const readiness = await getPeriodReadiness(period);

  return <PeriodCloseOverview period={period} readiness={readiness} />;
}
