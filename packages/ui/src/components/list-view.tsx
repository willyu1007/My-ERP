/**
 * ListView — the List paradigm's shared container. It owns the cross-cutting
 * concerns every list needs regardless of presentation: scene chrome (nav /
 * actions / stats), status filtering (a topbar dropdown, same control the Hub
 * uses), optional load-more, and the empty state. The per-item presentation
 * (card grid, table, row list) is supplied via `present`, so any List gets a
 * consistent filter / empty / load-more no matter how its items are drawn.
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown } from "./icons";
import { Menu } from "./menu";
import { EmptyState } from "./primitives";
import { Scene } from "./scene";
import { TopbarPortal } from "./topbar-slot";

export interface ListFilter<T> {
  readonly key: string;
  readonly label: string;
  /** Omit on the "全部" option (matches everything). */
  readonly predicate?: (item: T) => boolean;
}

export function ListView<T>({
  items,
  filters,
  pageSize,
  loadMoreLabel = "加载更多",
  empty,
  present,
  nav,
  actions,
  stats,
  intro,
}: {
  /** Items in their final display order (caller sorts before passing). */
  readonly items: readonly T[];
  /** Status/segment filters → chips in the scene bar. Optional. */
  readonly filters?: readonly ListFilter<T>[];
  /** Enable load-more: show this many, then reveal another page. Omit to show all. */
  readonly pageSize?: number;
  readonly loadMoreLabel?: string;
  readonly empty: { readonly title: string; readonly desc?: string };
  /** Render the resulting (filtered, capped) items in a presentation. */
  readonly present: (items: readonly T[]) => ReactNode;
  readonly nav?: ReactNode;
  readonly actions?: ReactNode;
  readonly stats?: ReactNode;
  readonly intro?: ReactNode;
}): React.ReactElement {
  const [activeKey, setActiveKey] = useState(filters?.[0]?.key ?? "all");
  const [count, setCount] = useState(pageSize ?? Number.POSITIVE_INFINITY);

  // Reset the load-more window when the active filter changes.
  useEffect(() => setCount(pageSize ?? Number.POSITIVE_INFINITY), [activeKey, pageSize]);

  const active = filters?.find((f) => f.key === activeKey);
  const filtered = active?.predicate ? items.filter(active.predicate) : items;
  const capped = pageSize != null ? filtered.slice(0, count) : filtered;
  const hasMore = pageSize != null && filtered.length > count;

  const countOf = (f: ListFilter<T>): number =>
    f.predicate ? items.filter(f.predicate).length : items.length;

  const filterMenu =
    filters && filters.length > 0 ? (
      <TopbarPortal>
        <div className="wb-topbar__tools">
          <Menu
            label="筛选"
            align="start"
            trigger={
              <>
                {active?.label ?? filters[0]?.label}
                {active && (
                  <span className="wb-mono" style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: 4 }}>
                    {countOf(active)}
                  </span>
                )}
                <IconChevronDown size={14} style={{ color: "var(--mt-stone)", marginLeft: 2 }} />
              </>
            }
          >
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className="mt-menu-item"
                role="menuitem"
                aria-current={activeKey === f.key ? "true" : undefined}
                onClick={() => setActiveKey(f.key)}
              >
                <span className="wb-spacer">{f.label}</span>
                <span className="wb-mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                  {countOf(f)}
                </span>
                {activeKey === f.key && (
                  <IconCheck size={14} style={{ color: "var(--mt-orange-700)", marginLeft: 6 }} />
                )}
              </button>
            ))}
          </Menu>
        </div>
      </TopbarPortal>
    ) : null;

  return (
    <>
      {filterMenu}
      <Scene nav={nav} actions={actions} stats={stats} intro={intro}>
      {filtered.length === 0 ? (
        <EmptyState title={empty.title} {...(empty.desc !== undefined ? { desc: empty.desc } : {})} />
      ) : (
        <>
          {present(capped)}
          {hasMore && (
            <button
              type="button"
              className="wb-loadmore mt-btn mt-btn--secondary mt-btn--sm"
              onClick={() => setCount((c) => c + (pageSize ?? 0))}
            >
              {loadMoreLabel}
            </button>
          )}
        </>
      )}
      </Scene>
    </>
  );
}
