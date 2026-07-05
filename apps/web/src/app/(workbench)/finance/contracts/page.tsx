import {
  getBusinessPartner,
  listBusinessPartners,
  listContracts,
} from '@/lib/finance/data-source';
import { ContractsClient } from './contracts-client';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * 合同 (T-005) — the transaction-lifecycle anchor. Create a contract and link
 * vouchers/payments to it (at entry); the detail page shows the merged timeline.
 * `?partnerId=` filters by linked 往来单位 (T-012 D9).
 */
export default async function ContractsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const partnerId = first(sp.partnerId);
  const [contracts, partners, filterPartner] = await Promise.all([
    listContracts(partnerId ? { partnerId } : undefined),
    listBusinessPartners({ active: true }),
    partnerId ? getBusinessPartner(partnerId) : Promise.resolve(null),
  ]);

  return (
    <ContractsClient
      contracts={contracts}
      partners={partners}
      filterPartner={filterPartner}
      initialEntryOpen={first(sp.entry) === '1'}
    />
  );
}
