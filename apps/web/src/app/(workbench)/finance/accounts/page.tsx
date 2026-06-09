import { listAccounts } from '@/lib/finance/data-source';
import { AccountsClient } from './accounts-client';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const accounts = await listAccounts();
  return <AccountsClient accounts={accounts} />;
}
