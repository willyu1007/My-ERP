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
"use client";

import type { ReactNode } from "react";
import { AppShell, ToastProvider, useToast, type ShellNav } from "@my-erp/ui";
import { NAV_BADGE_DAILY_ACCOUNTING_OPEN } from "@/lib/finance/scene-config";

const REGISTERED = [{ key: "erp", name: "智能ERP", mark: "智" }] as const;

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
      current: "erp",
      registered: REGISTERED,
      onSwitch: () => toast.notify("info", "切换场景", "演示：将进入所选场景应用"),
    },
    home: { label: "看板", href: "/" },
    groups: [
      {
        label: "工作流",
        add: {
          label: "添加工作流",
          onClick: () =>
            toast.notify("info", "添加工作流", "新增工作流需鉴权与初始化后启用（即将开放）"),
        },
        items: [
          {
            href: "/finance/daily-accounting",
            label: "凭证处理",
            match: ["/finance/daily-accounting", "/finance/vouchers"],
            badgeKey: NAV_BADGE_DAILY_ACCOUNTING_OPEN,
          },
          { href: "/finance/payments", label: "出纳收付" },
          { href: "/finance/contracts", label: "合同" },
          { href: "/finance/period-close", label: "期末结账" },
        ],
      },
      {
        label: "查询",
        items: [
          { href: "/finance/ledger", label: "账簿查询" },
          { href: "/finance/reports", label: "财务报表" },
        ],
      },
      {
        label: "设置",
        items: [
          {
            href: "/finance/settings",
            label: "账务设置",
            match: ["/finance/settings", "/finance/accounts"],
          },
        ],
      },
    ],
    sections: [{ prefix: "/system", label: "系统", href: "/system/health" }],
    create: [{ href: "/finance/daily-accounting", label: "录入凭证" }],
  };

  return (
    <AppShell
      nav={nav}
      accountName={accountName}
      badges={badges}
      onSearch={() => toast.notify("info", "搜索", "搜索功能即将上线（演示）")}
    >
      {children}
    </AppShell>
  );
}
