/**
 * EntityCard — the card presentation of the List paradigm. Domain-agnostic: it
 * renders a {@link CardModel} and owns layout, spacing, status-dot, tone and
 * hover only. Scenarios supply data via an adapter; this component never knows
 * about any domain object.
 */
import Link from "next/link";
import { Fragment } from "react";
import type { CardModel } from "../model/card-model";
import { IconArrowRight } from "./icons";

export function EntityCard({ model }: { readonly model: CardModel }): React.ReactElement {
  const { href, title, status, aside, primary, metrics, meta, entryLabel = "详情", emphasis } = model;
  const emphasisClass = emphasis ? ` wb-card--emphasis wb-emph--${emphasis}` : "";

  // Progress renders as a bottom-edge "baseline" bar (a foundation that grounds
  // the card) plus its fraction folded into the metrics line — so the only
  // graphic element sits at the foot, not as a band under the title.
  const progress = primary?.kind === "progress" ? primary : null;
  const pct = progress ? Math.max(0, Math.min(100, (progress.value / (progress.max || 1)) * 100)) : 0;
  const showStatsRow = Boolean(progress) || (metrics != null && metrics.length > 0);

  return (
    <Link href={href} className={`wb-card${emphasisClass}`}>
      <div className="wb-card__head">
        {status && (
          <span
            className={`wb-card__status wb-card__status--${status.tone}${status.hollow ? " wb-card__status--hollow" : ""}`}
            title={status.label}
            aria-label={status.label}
          />
        )}
        <h3 className="wb-card__title">{title}</h3>
        {aside && <span className="wb-card__aside">{aside}</span>}
      </div>

      {primary?.kind === "stat" && (
        <div className="wb-card__stat">
          <span className="wb-card__stat-value">{primary.value}</span>
          {primary.label && <span className="wb-card__stat-label">{primary.label}</span>}
        </div>
      )}
      {primary?.kind === "text" && (
        <p className={`wb-card__desc${primary.muted ? " wb-card__desc--muted" : ""}`}>{primary.text}</p>
      )}

      {showStatsRow && (
        <div className="wb-card__metrics">
          {progress && (
            <span>
              {progress.label} <b>{progress.display ?? progress.value}</b>
            </span>
          )}
          {metrics?.map((m) => (
            <span key={m.label}>
              {m.label} <b>{m.value}</b>
            </span>
          ))}
        </div>
      )}

      <div className="wb-card__foot">
        {meta && meta.length > 0 && (
          <span className="wb-card__meta">
            {meta.map((seg, i) => (
              <Fragment key={seg.text}>
                {i > 0 && <span className="wb-dot" />}
                <span className={seg.tone ? `wb-tone--${seg.tone}` : undefined}>{seg.text}</span>
              </Fragment>
            ))}
          </span>
        )}
        <span className="wb-card__enter">
          {entryLabel} <IconArrowRight size={14} />
        </span>
      </div>

      {progress && (
        <span className={`wb-card__baseline${progress.tone && progress.tone !== "navy" ? ` wb-card__baseline--${progress.tone}` : ""}`}>
          <span className="wb-card__baseline-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
    </Link>
  );
}
