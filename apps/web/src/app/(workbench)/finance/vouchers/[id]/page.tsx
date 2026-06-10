import { notFound } from 'next/navigation';
import { getVoucher } from '@/lib/finance/data-source';
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
  return <VoucherDetail voucher={voucher} />;
}
