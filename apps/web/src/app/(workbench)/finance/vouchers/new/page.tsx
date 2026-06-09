import { listAccounts } from '@/lib/finance/data-source';
import { NewVoucherClient } from './new-voucher-client';

export const dynamic = 'force-dynamic';

export default async function NewVoucherPage() {
  const accounts = await listAccounts();
  return <NewVoucherClient accounts={accounts} />;
}
