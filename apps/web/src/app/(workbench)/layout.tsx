import type { ReactNode } from 'react';
import { WorkbenchShell } from '@/components/workbench-shell';

/**
 * Workbench route group — wraps every page in the kit's locked AppShell (via the
 * host WorkbenchShell client wrapper) with the finance navigation. Identity is
 * mocked in W1 (no Logto yet). The personal task queue lives on the home 看板
 * (方案 A), so the sidebar no longer carries a 我的工作台 badge.
 */
export default function WorkbenchLayout({ children }: { readonly children: ReactNode }) {
  return (
    <WorkbenchShell accountName="演示会计" badges={{}}>
      {children}
    </WorkbenchShell>
  );
}
