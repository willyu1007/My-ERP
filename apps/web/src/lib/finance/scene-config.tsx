/**
 * Finance scenario configuration — supplies the domain-agnostic @my-erp/ui
 * AppShell with finance navigation. Platform-level: My-ERP is a modular ERP and
 * finance is the first module, so `home` points at the ERP overview and the
 * finance module lives under the /finance namespace (future modules get theirs).
 */
import type { ShellNav } from '@my-erp/ui';
import { IconBook, IconClipboard, IconClock, IconShield } from '@my-erp/ui';

/** Badge key for open daily-accounting work in the sidebar. */
export const NAV_BADGE_DAILY_ACCOUNTING_OPEN = 'dailyAccountingOpen';

export const financeNav: ShellNav = {
  home: { label: 'ERP 总览', href: '/' },
  groups: [
    {
      label: '财务工作流',
      showIcons: true,
      items: [
        {
          href: '/finance/daily-accounting',
          label: '日常账务处理',
          icon: <IconClipboard />,
          match: ['/finance/daily-accounting', '/finance/vouchers'],
          badgeKey: NAV_BADGE_DAILY_ACCOUNTING_OPEN,
        },
        {
          href: '/finance/period-close',
          label: '期末结账',
          icon: <IconClock />,
          soon: true,
        },
      ],
    },
    {
      label: '财务功能',
      showIcons: true,
      items: [{ href: '/finance/ledger', label: '账簿查询', icon: <IconBook /> }],
    },
    {
      label: '财务设置',
      showIcons: true,
      items: [
        {
          href: '/finance/settings',
          label: '账务设置',
          icon: <IconShield />,
          match: ['/finance/settings', '/finance/accounts'],
        },
      ],
    },
  ],
  create: [{ href: '/finance/vouchers/new', label: '录入凭证' }],
  sections: [
    { prefix: '/finance', label: '财务', href: '/finance/daily-accounting' },
    { prefix: '/system', label: '系统', href: '/system/health' },
  ],
};
