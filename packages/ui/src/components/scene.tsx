/**
 * Scene — the unified content-area shell for every workbench scenario.
 *
 * Domain-agnostic by design: it owns layout only (scene bar, intro, stats,
 * toolbar, body) and carries no education vocabulary. A scenario supplies the
 * slot contents via configuration (see lib/workbench/scene-config.ts), so the
 * same shell renders any workflow scene and stays a reusable template.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Scene({
  nav,
  filters,
  actions,
  intro,
  stats,
  toolbar,
  children,
}: {
  /** Secondary workflow navigation (segmented tabs). Optional. */
  readonly nav?: ReactNode;
  /** Inline filters (chipset etc.) sharing the scene-bar row, after the nav. Optional. */
  readonly filters?: ReactNode;
  /** Primary scene actions, right-aligned in the scene bar. Optional. */
  readonly actions?: ReactNode;
  /** One-line scene context / description. Optional. */
  readonly intro?: ReactNode;
  /** Stat strip. Optional. */
  readonly stats?: ReactNode;
  /** Filters / search / view toggles on their own row (when not inline). Optional. */
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
}): React.ReactElement {
  const hasBar = Boolean(nav) || Boolean(actions) || Boolean(filters);
  return (
    <div className="wb-scene wb-stack wb-stack--lg wb-reveal">
      {hasBar && (
        <div className="wb-scene__bar">
          <div className="wb-scene__lead">
            {nav}
            {filters}
          </div>
          {actions && <div className="wb-scene__actions">{actions}</div>}
        </div>
      )}
      {intro && <div className="wb-scene__intro">{intro}</div>}
      {toolbar && <div className="wb-scene__toolbar">{toolbar}</div>}
      {stats}
      <div className="wb-scene__body wb-stack wb-stack--lg">{children}</div>
    </div>
  );
}

export interface SceneNavItem {
  readonly href: string;
  readonly label: string;
  readonly count?: number;
}

/**
 * SceneNav — segmented secondary navigation, active by current route.
 * Driven by a plain item list so any scenario can declare its own workflow
 * steps in configuration.
 */
export function SceneNav({
  items,
  ariaLabel,
}: {
  readonly items: readonly SceneNavItem[];
  readonly ariaLabel?: string;
}): React.ReactElement {
  const pathname = usePathname();
  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="wb-segmented" role="tablist" aria-label={ariaLabel}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`wb-segmented__item${isActive(t.href) ? " wb-segmented__item--active" : ""}`}
          aria-current={isActive(t.href) ? "page" : undefined}
        >
          {t.label}
          {typeof t.count === "number" && t.count > 0 && (
            <span className="wb-segmented__count">{t.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
