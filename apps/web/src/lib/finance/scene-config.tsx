/**
 * Finance scenario configuration — supplies the domain-agnostic @my-erp/ui
 * AppShell with finance navigation. Platform-level: My-ERP is a modular ERP and
 * finance is the first module, so `home` points at the ERP overview and the
 * finance module lives under the /finance namespace (future modules get theirs).
 */
import type { ShellNav } from '@my-erp/ui';

/** Badge key for open daily-accounting work in the sidebar. */
export const NAV_BADGE_DAILY_ACCOUNTING_OPEN = 'dailyAccountingOpen';

export const financeNav: ShellNav = {
  home: { label: '看板', href: '/' },
  groups: [
    {
      label: '工作流',
      showIcons: false,
      items: [
        {
          href: '/finance/daily-accounting',
          label: '凭证处理',
          match: ['/finance/daily-accounting', '/finance/vouchers'],
          badgeKey: NAV_BADGE_DAILY_ACCOUNTING_OPEN,
        },
        {
          href: '/finance/period-close',
          label: '期末结账',
          soon: true,
        },
      ],
    },
    {
      label: '查询',
      showIcons: false,
      items: [{ href: '/finance/ledger', label: '账簿查询' }],
    },
    {
      label: '设置',
      showIcons: false,
      items: [
        {
          href: '/finance/settings',
          label: '账务设置',
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
