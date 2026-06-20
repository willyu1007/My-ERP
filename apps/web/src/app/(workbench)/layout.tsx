import type { ReactNode } from 'react';
import { listVouchers } from '@/lib/finance/data-source';
import { NAV_BADGE_DAILY_ACCOUNTING_OPEN } from '@/lib/finance/scene-config';
import { WorkbenchShell } from '@/components/workbench-shell';

/**
 * Workbench route group — wraps every page in the kit's locked AppShell (via the
 * host WorkbenchShell client wrapper) with the finance navigation. Identity is
 * mocked in W1 (no Logto yet). The sidebar badge flows through the data-source
 * seam, like every other page.
 */
export default async function WorkbenchLayout({ children }: { readonly children: ReactNode }) {
  const vouchers = await listVouchers();
  const openDailyCount = vouchers.filter((v) => v.status === 'draft' || v.status === 'pending')
    .length;

  return (
    <WorkbenchShell
      accountName="演示会计"
      badges={{ [NAV_BADGE_DAILY_ACCOUNTING_OPEN]: openDailyCount }}
    >
      {children}
    </WorkbenchShell>
  );
}
