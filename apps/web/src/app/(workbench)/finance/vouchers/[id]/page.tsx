import { notFound } from 'next/navigation';
import { getVoucher, listAccounts, listCashFlowItems } from '@/lib/finance/data-source';
import { VoucherFastEntry } from '../../daily-accounting/voucher-fast-entry';
import { VoucherDetail } from './voucher-detail';

export const dynamic = 'force-dynamic';

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
    const [accounts, cashFlowItems] = await Promise.all([listAccounts(), listCashFlowItems()]);
    const initial = {
      date: voucher.date,
      summary: voucher.summary,
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
        initialDate={voucher.date}
        voucherId={voucher.id}
        initial={initial}
      />
    );
  }

  return <VoucherDetail voucher={voucher} />;
}
