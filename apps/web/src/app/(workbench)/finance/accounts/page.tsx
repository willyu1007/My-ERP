import { getStandardChartDiff, listAccounts } from '@/lib/finance/data-source';
import { AccountsClient } from './accounts-client';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const [accounts, chartDiff] = await Promise.all([listAccounts(), getStandardChartDiff()]);
  return <AccountsClient accounts={accounts} chartDiff={chartDiff} />;
}
