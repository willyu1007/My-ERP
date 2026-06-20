/**
 * Finance shell config. The full ShellNav (groups, scenario switcher, sections,
 * home, create, 添加工作流) is assembled with its toast/router callbacks in the
 * client wrapper `@/components/workbench-shell`; this module only holds the
 * shared sidebar badge key that both the wrapper (badgeKey) and the (workbench)
 * layout (badges map) reference.
 */

/** Badge key for open daily-accounting work in the sidebar. */
export const NAV_BADGE_DAILY_ACCOUNTING_OPEN = "dailyAccountingOpen";
