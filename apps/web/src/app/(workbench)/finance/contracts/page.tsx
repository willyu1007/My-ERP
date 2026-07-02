import { listContracts } from '@/lib/finance/data-source';
import { ContractsClient } from './contracts-client';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * 合同 (T-005) — the transaction-lifecycle anchor. Create a contract and link
 * vouchers/payments to it (at entry); the detail page shows the merged timeline.
 */
export default async function ContractsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const contracts = await listContracts();

  return <ContractsClient contracts={contracts} initialEntryOpen={first(sp.entry) === '1'} />;
}
