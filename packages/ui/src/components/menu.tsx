/**
 * Menu — a small dropdown (trigger button + popover), reusing the `mt-menu`
 * style. Closes on outside-click / Escape / item-click.
 */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Menu({
  trigger,
  label,
  align = "end",
  children,
}: {
  readonly trigger: ReactNode;
  readonly label: string;
  readonly align?: "start" | "end";
  readonly children: ReactNode;
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
    <div className="wb-menu2" ref={ref}>
      <button
        type="button"
        className={`wb-menu2__btn${open ? " wb-menu2__btn--on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`mt-menu wb-menu2__pop wb-menu2__pop--${align}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
