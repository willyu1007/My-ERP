import { listVouchers } from '@/lib/finance/data-source';
import { VouchersClient } from './vouchers-client';

// Demo data-source today; force-dynamic keeps the seam honest for the real API.
export const dynamic = 'force-dynamic';

export default async function VouchersPage() {
  const vouchers = await listVouchers();
  return <VouchersClient vouchers={vouchers} />;
}
