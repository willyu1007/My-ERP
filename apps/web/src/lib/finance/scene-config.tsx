/**
 * Finance scenario configuration — supplies the domain-agnostic @my-erp/ui
 * AppShell with finance navigation. Platform-level: My-ERP is a modular ERP and
 * finance is the first module, so `home` points at the ERP overview and the
 * finance module lives under the /finance namespace (future modules get theirs).
 */
import type { ShellNav } from '@my-erp/ui';
import { IconBook, IconClipboard, IconList } from '@my-erp/ui';

/** Badge key for the "待审核" count pill on the 记账凭证 nav item. */
export const NAV_BADGE_VOUCHERS_PENDING = 'vouchersPending';

export const financeNav: ShellNav = {
  home: { label: 'ERP 总览', href: '/' },
  groups: [
    {
      label: '财务 · 总账',
      showIcons: true,
      items: [
        {
          href: '/finance/vouchers',
          label: '记账凭证',
          icon: <IconClipboard />,
          match: ['/finance/vouchers'],
          badgeKey: NAV_BADGE_VOUCHERS_PENDING,
        },
        { href: '/finance/accounts', label: '会计科目', icon: <IconList /> },
        { href: '/finance/ledger', label: '账簿', icon: <IconBook /> },
      ],
    },
  ],
  create: [{ href: '/finance/vouchers/new', label: '新增凭证' }],
  sections: [
    { prefix: '/finance', label: '财务', href: '/finance/vouchers' },
    { prefix: '/system', label: '系统', href: '/system/health' },
  ],
};
