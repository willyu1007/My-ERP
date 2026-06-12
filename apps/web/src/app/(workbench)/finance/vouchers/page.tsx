import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function VouchersPage() {
  redirect('/finance/daily-accounting');
}
