'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ShellNav } from '../model/nav';
import { AccountMenu } from './account-menu';
import { IconSearch, IconSidebar } from '@willyu1007/web-workbench';
import { SidebarCreate } from './sidebar-create';
import { useToast } from './toast';

function matchPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function Sidebar({
  open,
  onClose,
  onCollapse,
  nav,
  badges,
  accountName,
  signOutHref,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCollapse: () => void;
  readonly nav: ShellNav;
  readonly badges: Readonly<Record<string, number>>;
  readonly accountName: string;
  readonly signOutHref?: string;
}): React.ReactElement {
  const pathname = usePathname();
  const toast = useToast();

  function search(): void {
    toast.notify('info', '搜索', '搜索功能即将上线（演示）');
  }

  return (
    <>
      {open && <div className="wb-sidebar__backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`wb-sidebar${open ? ' wb-sidebar--open' : ''}`}>
        <div className="wb-sidebar__top">
          <button
            type="button"
            className="wb-iconbtn"
            aria-label="搜索"
            title="搜索"
            onClick={search}
          >
            <IconSearch size={18} />
          </button>
          <button
            type="button"
            className="wb-iconbtn"
            aria-label="折叠侧栏"
            title="折叠侧栏"
            onClick={onCollapse}
          >
            <IconSidebar size={18} />
          </button>
        </div>

        <nav className="wb-nav">
          {nav.create && nav.create.length > 0 && (
            <div className="wb-nav__group">
              <SidebarCreate items={nav.create} onNavigate={onClose} />
            </div>
          )}
          {nav.groups.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`} className="wb-nav__group">
              {group.label && <p className="wb-nav__group-label">{group.label}</p>}
              {group.items.map((item) => {
                const active = (item.match ?? [item.href]).some((p) => matchPrefix(pathname, p));
                const count = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`wb-nav__item${group.showIcons ? '' : ' wb-nav__item--noicon'}${active ? ' wb-nav__item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {group.showIcons && item.icon && (
                      <span className="wb-nav__icon">{item.icon}</span>
                    )}
                    <span className="wb-nav__label">{item.label}</span>
                    {count > 0 && <span className="wb-nav__count">{count}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="wb-sidebar__foot">
          <AccountMenu accountName={accountName} {...(signOutHref ? { signOutHref } : {})} />
        </div>
      </aside>
    </>
  );
}
