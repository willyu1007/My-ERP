/**
 * Cell kit — reusable cell renderers for EntityTable columns. They cover the
 * common 80% (identity, status, metric, progress) so scenarios compose columns
 * instead of re-hand-rolling cells, keeping cell look consistent. The column
 * `render` escape hatch stays open for the bespoke 20%.
 */
import type { ReactNode } from "react";
import type { CardTone } from "../model/card-model";
import { Badge } from "./badge";

/** Identity cell: avatar + primary name + secondary ref. */
export function CellIdentity({
  avatar,
  name,
  sub,
}: {
  readonly avatar?: ReactNode;
  readonly name: ReactNode;
  readonly sub?: ReactNode;
}): React.ReactElement {
  return (
    <div className="wb-tcell-id">
      {avatar != null && <span className="mt-avatar wb-avatar-row">{avatar}</span>}
      <div className="wb-tcell-id__main">
        <span className="wb-tcell-id__name">{name}</span>
        {sub != null && <span className="wb-mono wb-hint">{sub}</span>}
      </div>
    </div>
  );
}

/** Numeric / metric cell: mono tabular, optional semantic tone, muted fallback. */
export function CellMetric({
  value,
  tone,
  empty = "—",
}: {
  readonly value: string | number | null | undefined;
  readonly tone?: CardTone | undefined;
  readonly empty?: ReactNode;
}): React.ReactElement {
  if (value == null || value === "") return <span className="wb-muted">{empty}</span>;
  return <span className={`wb-mono${tone ? ` wb-tone--${tone}` : ""}`}>{value}</span>;
}

/** Progress cell: a mono fraction + a compact fixed-width bar. */
export function CellProgress({
  value,
  max,
  display,
  tone,
}: {
  readonly value: number;
  readonly max: number;
  readonly display?: string;
  readonly tone?: "navy" | "accent" | "success" | "warning";
}): React.ReactElement {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <span className="wb-tcell-progress">
      <span className="wb-tcell-progress__label">{display ?? `${value}/${max}`}</span>
      <span className="wb-tcell-progress__track">
        <span
          className={`wb-tcell-progress__fill${tone && tone !== "navy" ? ` wb-tcell-progress__fill--${tone}` : ""}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

/** Status cell: a generic status badge. The scenario maps its status → tone+label. */
export function CellStatus({
  tone,
  label,
}: {
  readonly tone?: CardTone;
  readonly label: string;
}): React.ReactElement {
  return <Badge {...(tone ? { tone } : {})}>{label}</Badge>;
}
