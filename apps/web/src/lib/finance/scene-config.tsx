/**
 * Finance shell config. The full ShellNav (groups, scenario switcher, sections,
 * home, create, 添加工作流) is assembled with its toast/router callbacks in the
 * client wrapper `@/components/workbench-shell`; this module only holds the
 * shared sidebar badge key that both the wrapper (badgeKey) and the (workbench)
 * layout (badges map) reference.
 */

/**
 * Badge key for my open work-item tasks in the sidebar (我的工作台). Sourced from
 * the WorkItem kernel (`my_tasks`), not derived from voucher status — see T-009.
 */
export const NAV_BADGE_MY_TASKS_OPEN = "myTasksOpen";
