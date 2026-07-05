import { listBusinessPartners, listMembers } from '@/lib/finance/data-source';
import { PartnersClient } from './partners-client';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * 往来单位 (T-012 Phase 1) — org-entered master data for payment/contract
 * counterparties: companies and individuals, searchable by name/wechat/tags.
 */
export default async function PartnersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [partners, members] = await Promise.all([listBusinessPartners(), listMembers()]);

  return (
    <PartnersClient
      partners={partners}
      members={members}
      initialEntryOpen={first(sp.entry) === '1'}
    />
  );
}
