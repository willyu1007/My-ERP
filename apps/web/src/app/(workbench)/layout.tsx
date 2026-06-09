import type { ReactNode } from 'react';
import { AppShell } from '@my-erp/ui';
import { listVouchers } from '@/lib/finance/data-source';
import { NAV_BADGE_VOUCHERS_PENDING, financeNav } from '@/lib/finance/scene-config';

/**
 * Workbench route group — wraps every page in the domain-agnostic AppShell with
 * the finance navigation. Identity/account wiring is mocked in W1 (no Logto yet).
 * The sidebar badge flows through the data-source seam, like every other page.
 */
export default async function WorkbenchLayout({ children }: { readonly children: ReactNode }) {
  const vouchers = await listVouchers();
  const pendingCount = vouchers.filter((v) => v.status === 'pending').length;

  return (
    <AppShell
      accountName="演示会计"
      nav={financeNav}
      badges={{ [NAV_BADGE_VOUCHERS_PENDING]: pendingCount }}
    >
      {children}
    </AppShell>
  );
}
