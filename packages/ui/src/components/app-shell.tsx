'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useState, type ReactNode } from 'react';
import type { ShellNav } from '../model/nav';
import { BreadcrumbProvider, useBreadcrumbTrail, type Crumb } from './breadcrumb';
import { IconChevronRight, IconMenu } from '@willyu1007/web-workbench';
import { Sidebar } from './sidebar';
import { ToastProvider } from './toast';
import { TopbarSlotContext } from '@willyu1007/web-workbench';

function sectionFor(nav: ShellNav, pathname: string): Crumb {
  const hit = nav.sections.find(
    (c) => pathname === c.prefix || pathname.startsWith(`${c.prefix}/`),
  );
  if (hit) return { label: hit.label, href: hit.href };
  return nav.home ? { label: nav.home.label, href: nav.home.href } : { label: '首页', href: '/' };
}

function TopbarBreadcrumb({ nav }: { readonly nav: ShellNav }): React.ReactElement {
  const pathname = usePathname();
  const trail = useBreadcrumbTrail();
  const items: readonly Crumb[] = [sectionFor(nav, pathname), ...trail];
  return (
    <div className="wb-topbar__crumbs">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {i > 0 && (
              <span className="wb-topbar__sep" aria-hidden="true">
                <IconChevronRight size={13} />
              </span>
            )}
            {item.href && !isLast ? (
              <Link href={item.href} className="wb-topbar__crumb wb-topbar__crumb--link">
                {item.label}
              </Link>
            ) : (
              <span className="wb-topbar__crumb" aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * AppShell — scenario-agnostic workbench shell (sidebar + topbar + content).
 * A scenario supplies its navigation via {@link ShellNav}; the shell carries no
 * domain vocabulary, so any module (finance first) reuses it unchanged.
 */
export function AppShell({
  accountName,
  nav,
  badges = {},
  signOutHref,
  children,
}: {
  readonly accountName: string;
  readonly nav: ShellNav;
  readonly badges?: Readonly<Record<string, number>>;
  readonly signOutHref?: string;
  readonly children: ReactNode;
}): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  return (
    <ToastProvider>
      <BreadcrumbProvider>
        <div className={`wb-shell${collapsed ? ' wb-shell--collapsed' : ''}`}>
          <Sidebar
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onCollapse={() => setCollapsed(true)}
            nav={nav}
            badges={badges}
            accountName={accountName}
            {...(signOutHref ? { signOutHref } : {})}
          />
          <div className="wb-main">
            <header className="wb-topbar">
              <button
                type="button"
                className="wb-burger"
                aria-label="打开导航"
                onClick={() => setDrawerOpen(true)}
              >
                <IconMenu size={20} />
              </button>
              {collapsed && (
                <button
                  type="button"
                  className="wb-expand"
                  aria-label="展开侧栏"
                  title="展开侧栏"
                  onClick={() => setCollapsed(false)}
                >
                  <IconMenu size={18} />
                </button>
              )}
              <TopbarBreadcrumb nav={nav} />
              <div className="wb-topbar__actions" ref={setTopbarSlot} />
              <div className="wb-topbar__spacer" />
            </header>
            <main className="wb-content">
              <TopbarSlotContext.Provider value={topbarSlot}>{children}</TopbarSlotContext.Provider>
            </main>
          </div>
        </div>
      </BreadcrumbProvider>
    </ToastProvider>
  );
}
