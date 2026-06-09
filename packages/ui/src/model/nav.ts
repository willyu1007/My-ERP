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
  /** Extra path prefixes that also mark this item active. */
  readonly match?: readonly string[];
  /** Key into the badges map for a count pill. */
  readonly badgeKey?: string;
}

export interface NavGroupDef {
  readonly label?: string;
  readonly showIcons?: boolean;
  readonly items: readonly NavItemDef[];
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
}
