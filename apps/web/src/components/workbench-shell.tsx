/**
 * WorkbenchShell — host-side client wrapper that supplies the kit's locked
 * <AppShell> with the finance ShellNav + callbacks. The server (workbench)
 * layout passes only serializable accountName/badges; routing/toast callbacks
 * are wired here (client). Toast is host chrome (kept in @my-erp/ui), provided
 * here so the nav callbacks can use it.
 *
 * W1: identity is mocked (no signOutHref); My-ERP is a single registered
 * scenario, so the switcher lists only itself and onSwitch is a stub.
 */
'use client';

import type { ReactNode } from 'react';
import { ToastProvider, useToast } from '@my-erp/ui/feedback';
import { AppShell, type ShellNav } from '@my-erp/ui/shell';

const REGISTERED = [{ key: 'erp', name: '智能ERP', mark: '智' }] as const;

export function WorkbenchShell({
  accountName,
  badges,
  children,
}: {
  readonly accountName: string;
  readonly badges: Readonly<Record<string, number>>;
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <ToastProvider>
      <ShellWithNav accountName={accountName} badges={badges}>
        {children}
      </ShellWithNav>
    </ToastProvider>
  );
}

function ShellWithNav({
  accountName,
  badges,
  children,
}: {
  readonly accountName: string;
  readonly badges: Readonly<Record<string, number>>;
  readonly children: ReactNode;
}): React.ReactElement {
  const toast = useToast();

  const nav: ShellNav = {
    scenario: {
      current: 'erp',
      registered: REGISTERED,
      onSwitch: () => toast.notify('info', '切换场景', '演示：将进入所选场景应用'),
    },
    home: { label: '看板', href: '/' },
    groups: [
      {
        label: '工作流',
        items: [
          {
            href: '/finance/daily-accounting',
            label: '凭证处理',
            match: ['/finance/daily-accounting', '/finance/vouchers'],
          },
          { href: '/finance/payments', label: '出纳收付' },
          { href: '/finance/period-close', label: '期末结账' },
        ],
      },
      {
        label: '查询',
        items: [
          { href: '/finance/ledger', label: '账簿查询' },
          { href: '/finance/reports', label: '财务报表' },
          { href: '/finance/contracts', label: '合同台账' },
        ],
      },
      {
        label: '设置',
        items: [
          {
            href: '/finance/settings',
            label: '账务设置',
            match: ['/finance/settings', '/finance/accounts'],
          },
        ],
      },
    ],
    sections: [{ prefix: '/system', label: '系统', href: '/system/health' }],
    create: [
      { href: '/finance/daily-accounting', label: '制单' },
      { href: '/finance/intakes', label: '票据录入' },
      { href: '/finance/contracts?entry=1', label: '登记合同' },
      { href: '/finance/payments?entry=1', label: '登记收付款' },
    ],
  };

  return (
    <AppShell
      nav={nav}
      accountName={accountName}
      badges={badges}
      onSearch={() => toast.notify('info', '搜索', '搜索功能即将上线（演示）')}
    >
      {children}
    </AppShell>
  );
}
