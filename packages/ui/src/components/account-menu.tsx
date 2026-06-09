"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconLogout } from "./icons";

/** Bottom-of-sidebar account control (morethan ecosystem identity). */
export function AccountMenu({
  accountName,
  signOutHref,
}: {
  readonly accountName: string;
  readonly signOutHref?: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="wb-account" ref={ref}>
      <button
        type="button"
        className="wb-account__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="wb-account__name">{accountName}</span>
        <IconChevronDown size={13} style={{ color: "var(--mt-stone)", flexShrink: 0 }} />
      </button>
      {open && signOutHref && (
        <div className="mt-menu wb-account__pop" role="menu">
          <Link
            href={signOutHref}
            className="mt-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <IconLogout size={16} />
            <span className="wb-spacer">退出登录</span>
          </Link>
        </div>
      )}
    </div>
  );
}
