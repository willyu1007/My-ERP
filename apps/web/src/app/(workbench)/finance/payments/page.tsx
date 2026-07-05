import {
  getBusinessPartner,
  listAccounts,
  listBusinessPartners,
  listContracts,
  listPayments,
} from '@/lib/finance/data-source';
import { PaymentsClient } from './payments-client';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * 出纳收付款 (T-007 C3) — create a 收/付款单 and track the request→approve→confirm
 * lifecycle. The list is backend-backed; actions live on the detail page.
 * `?partnerId=` filters by linked 往来单位 (T-012 D9).
 */
export default async function PaymentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const partnerId = first(sp.partnerId);
  const [payments, accounts, contracts, partners, filterPartner] = await Promise.all([
    listPayments(partnerId ? { partnerId } : undefined),
    listAccounts(),
    listContracts(),
    listBusinessPartners({ active: true }),
    partnerId ? getBusinessPartner(partnerId) : Promise.resolve(null),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PaymentsClient
      payments={payments}
      accounts={accounts}
      contracts={contracts}
      partners={partners}
      filterPartner={filterPartner}
      initialDate={today}
      initialEntryOpen={first(sp.entry) === '1'}
    />
  );
}
