import { listVouchers } from '@/lib/finance/data-source';
import { DailyAccountingClient } from './daily-accounting-client';

export const dynamic = 'force-dynamic';

export default async function DailyAccountingPage() {
  const vouchers = await listVouchers();
  return <DailyAccountingClient vouchers={vouchers} />;
}
