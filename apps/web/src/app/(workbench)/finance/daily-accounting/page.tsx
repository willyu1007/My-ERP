import { listAccounts, listVouchers } from '@/lib/finance/data-source';
import { DailyAccountingClient } from './daily-accounting-client';

export const dynamic = 'force-dynamic';

export default async function DailyAccountingPage() {
  const [vouchers, accounts] = await Promise.all([listVouchers(), listAccounts()]);
  const today = new Date().toISOString().slice(0, 10);
  return <DailyAccountingClient vouchers={vouchers} accounts={accounts} initialDate={today} />;
}
