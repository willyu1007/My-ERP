import type { ReactNode } from 'react';

/**
 * Scenario-agnostic shell navigation config. A scenario (e.g. finance) supplies
 * a {@link ShellNav}; AppShell/Sidebar render it and carry no domain vocabulary.
 */

/** A primary sidebar navigation link. */
export interface NavItemDef {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Render as visible but unavailable, for planned workflow entries. */
  readonly soon?: boolean;
  /** Extra path prefixes that also mark this item active. */
  readonly match?: readonly string[];
  /** Key into the badges map for a count pill. */
  readonly badgeKey?: string;
}

/** A group-level "add" affordance (e.g. register a new workflow). */
export interface NavGroupAddDef {
  readonly label: string;
  /** Navigate here on click; omit to surface {@link hint} as a toast instead. */
  readonly href?: string;
  /** Toast message when there is no href yet (e.g. needs auth + init). */
  readonly hint?: string;
}

export interface NavGroupDef {
  readonly label?: string;
  readonly showIcons?: boolean;
  readonly items: readonly NavItemDef[];
  /** Renders a "+" action on the group header. */
  readonly add?: NavGroupAddDef;
}

/** An entry in the sidebar "新增" create menu. */
export interface CreateItemDef {
  readonly href: string;
  readonly label: string;
  readonly soon?: boolean;
}

/** Route prefix → topbar breadcrumb section. */
export interface SectionDef {
  readonly prefix: string;
  readonly label: string;
  readonly href: string;
}

export interface ShellNav {
  readonly groups: readonly NavGroupDef[];
  readonly create?: readonly CreateItemDef[];
  readonly sections: readonly SectionDef[];
  readonly home?: { readonly label: string; readonly href: string };
  /** Module label shown as the first topbar crumb before the active workflow. */
  readonly module?: { readonly label: string; readonly href?: string };
}
