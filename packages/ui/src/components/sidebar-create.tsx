'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CreateItemDef } from '../model/nav';
import { IconPlus } from '@willyu1007/web-workbench';

/** Sidebar "新增" item that opens a create menu. Items are supplied by the scenario. */
export function SidebarCreate({
  items,
  label = '新增',
  onNavigate,
}: {
  readonly items: readonly CreateItemDef[];
  readonly label?: string;
  readonly onNavigate?: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="wb-create" ref={ref}>
      <button
        type="button"
        className="wb-nav__item"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="wb-nav__icon">
          <IconPlus />
        </span>
        <span className="wb-nav__label">{label}</span>
      </button>
      {open && (
        <div className="mt-menu wb-create__pop" role="menu">
          {items.map((c) =>
            c.soon ? (
              <span
                key={c.href}
                className="mt-menu-item"
                role="menuitem"
                aria-disabled="true"
                style={{ opacity: 0.5, cursor: 'not-allowed' }}
              >
                <span className="wb-spacer">{c.label}</span>
                <span className="wb-nav__soon">建设中</span>
              </span>
            ) : (
              <Link
                key={c.href}
                href={c.href}
                role="menuitem"
                className="mt-menu-item"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
              >
                <span className="wb-spacer">{c.label}</span>
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
