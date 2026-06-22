import type { ReactNode } from 'react';
import { countMyOpenTasks } from '@/lib/finance/data-source';
import { NAV_BADGE_MY_TASKS_OPEN } from '@/lib/finance/scene-config';
import { WorkbenchShell } from '@/components/workbench-shell';

/**
 * Workbench route group — wraps every page in the kit's locked AppShell (via the
 * host WorkbenchShell client wrapper) with the finance navigation. Identity is
 * mocked in W1 (no Logto yet). The sidebar badge counts my open tasks from the
 * WorkItem kernel (T-009) and flows through the data-source seam (0 in demo mode).
 */
export default async function WorkbenchLayout({ children }: { readonly children: ReactNode }) {
  const myTasksOpen = await countMyOpenTasks();

  return (
    <WorkbenchShell accountName="演示会计" badges={{ [NAV_BADGE_MY_TASKS_OPEN]: myTasksOpen }}>
      {children}
    </WorkbenchShell>
  );
}
