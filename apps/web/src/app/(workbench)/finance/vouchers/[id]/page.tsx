import { notFound } from 'next/navigation';
import {
  getVoucher,
  listAccounts,
  listCashFlowItems,
  listContracts,
} from '@/lib/finance/data-source';
import { VoucherFastEntry } from '../../daily-accounting/voucher-fast-entry';
import { VoucherDetail } from './voucher-detail';

export const dynamic = 'force-dynamic';

type FastEntryDraftPayload = {
  readonly version: 1;
  readonly summary?: string;
  readonly contractId?: string | null;
  readonly lines?: readonly {
    readonly accountCode?: string;
    readonly accountName?: string;
    readonly summary?: string;
    readonly debit?: string;
    readonly credit?: string;
    readonly cashFlowItem?: string;
  }[];
};

function isFastEntryDraftPayload(value: unknown): value is FastEntryDraftPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { readonly version?: unknown; readonly lines?: unknown };
  return (
    candidate.version === 1 && (candidate.lines === undefined || Array.isArray(candidate.lines))
  );
}

export default async function VoucherDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const voucher = await getVoucher(id);
  if (!voucher) notFound();

  // A draft (e.g. a capture-generated one) opens in the fast-entry editor to
  // complete + confirm; posted/reversed vouchers stay read-only.
  if (voucher.status === 'draft') {
    const [accounts, cashFlowItems, contracts] = await Promise.all([
      listAccounts(),
      listCashFlowItems(),
      listContracts(),
    ]);
    const payload = isFastEntryDraftPayload(voucher.draftPayload) ? voucher.draftPayload : null;
    const initial = payload
      ? {
          date: voucher.date,
          summary: payload.summary ?? '',
          contractId: payload.contractId ?? null,
          lines: (payload.lines ?? []).map((l) => ({
            accountCode: l.accountCode ?? '',
            accountName: l.accountName ?? '',
            summary: l.summary ?? '',
            debit: l.debit ?? '',
            credit: l.credit ?? '',
            cashFlowItem: l.cashFlowItem ?? '',
          })),
        }
      : {
          date: voucher.date,
          summary: voucher.summary,
          contractId: voucher.contractId,
          lines: voucher.lines.map((l) => ({
            accountCode: l.accountCode,
            accountName: l.accountName,
            summary: l.summary,
            debit: l.debit ?? '',
            credit: l.credit ?? '',
            cashFlowItem: l.cashFlowItem ?? '',
          })),
        };
    return (
      <VoucherFastEntry
        accounts={accounts}
        cashFlowItems={cashFlowItems}
        contracts={contracts}
        initialDate={voucher.date}
        voucherId={voucher.id}
        initial={initial}
      />
    );
  }

  return <VoucherDetail voucher={voucher} />;
}
