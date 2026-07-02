import { listAccounts, listContracts, listPayments } from '@/lib/finance/data-source';
import { PaymentsClient } from './payments-client';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * 出纳收付款 (T-007 C3) — create a 收/付款单 and track the request→approve→confirm
 * lifecycle. The list is backend-backed; actions live on the detail page.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [payments, accounts, contracts] = await Promise.all([
    listPayments(),
    listAccounts(),
    listContracts(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PaymentsClient
      payments={payments}
      accounts={accounts}
      contracts={contracts}
      initialDate={today}
      initialEntryOpen={first(sp.entry) === '1'}
    />
  );
}
