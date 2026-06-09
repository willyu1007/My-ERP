/**
 * Pure presentational primitives for workbench pages (server-safe, no hooks).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronRight, IconInbox } from "./icons";

/* ---------- Breadcrumb ---------- */
export function Breadcrumb({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly href?: string }[];
}): React.ReactElement {
  return (
    <nav className="wb-breadcrumb" aria-label="面包屑">
      {items.map((item, i) => (
        <span key={item.label} className="wb-row" style={{ gap: 8 }}>
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
          {i < items.length - 1 && (
            <span className="wb-breadcrumb__sep" aria-hidden="true">
              <IconChevronRight size={13} />
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ---------- Stat strip ----------
   A line-free "pulse" row of read-only metrics — no tray, no cards, no icons.
   Cards (border + shadow) signal a clickable object; stats are just numbers. */
export function StatStrip({
  children,
  compact,
}: {
  readonly children: ReactNode;
  /** Denser in-card variant (smaller figures, no trailing margin). */
  readonly compact?: boolean;
}): React.ReactElement {
  return <div className={`wb-stats${compact ? " wb-stats--compact" : ""}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  unit,
  foot,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly unit?: string;
  readonly foot?: ReactNode;
}): React.ReactElement {
  return (
    <div className="wb-stat">
      <span className="wb-stat__label">{label}</span>
      <div className="wb-stat__value">
        {value}
        {unit && <span className="wb-stat__unit">{unit}</span>}
      </div>
      {foot && <div className="wb-stat__foot">{foot}</div>}
    </div>
  );
}

/* ---------- Section ---------- */
export function Section({
  title,
  link,
  children,
}: {
  readonly title: string;
  readonly link?: { readonly href: string; readonly label: string };
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <section className="wb-section">
      <div className="wb-section__head">
        <h2 className="wb-section__title">{title}</h2>
        {link && (
          <Link className="wb-section__link" href={link.href}>
            {link.label}
            <IconChevronRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly desc?: string;
  readonly action?: ReactNode;
}): React.ReactElement {
  return (
    <div className="wb-empty">
      <span className="wb-empty__icon">{icon ?? <IconInbox size={22} />}</span>
      <h3 className="wb-empty__title">{title}</h3>
      {desc && <p className="wb-empty__desc">{desc}</p>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

/* ---------- Meter ---------- */
export function Meter({
  label,
  value,
  display,
  tone = "navy",
  max = 100,
}: {
  readonly label: string;
  readonly value: number;
  readonly display?: string;
  readonly tone?: "navy" | "accent" | "success" | "warning";
  readonly max?: number;
}): React.ReactElement {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fillClass = tone === "navy" ? "wb-meter__fill" : `wb-meter__fill wb-meter__fill--${tone}`;
  return (
    <div className="wb-meter">
      <div className="wb-meter__head">
        <span className="wb-meter__label">{label}</span>
        <span className="wb-meter__value">{display ?? `${value}`}</span>
      </div>
      <div className="wb-meter__track">
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
