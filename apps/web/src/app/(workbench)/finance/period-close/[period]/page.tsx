import { notFound, redirect } from 'next/navigation';
import { getPeriodReadiness } from '@/lib/finance/data-source';
import { nextPeriodWorkflow } from '../period-close-workflow';

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PeriodClosePeriodPage({
  params,
}: {
  readonly params: Promise<{ readonly period: string }>;
}) {
  const { period } = await params;
  if (!PERIOD_RE.test(period)) notFound();

  const readiness = await getPeriodReadiness(period);

  redirect(`/finance/period-close/${period}/${nextPeriodWorkflow(readiness)}`);
}
