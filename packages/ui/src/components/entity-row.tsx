/**
 * EntityRow — the row presentation of the List paradigm (also used for Queue
 * rows). Domain-agnostic: it renders a {@link RowModel} onto the shared
 * `wb-list__row` skeleton. With `href` the whole row is a link (chevron, hover);
 * otherwise it is a static row that can host `trailing` action buttons (Queue).
 */
import Link from "next/link";
import { Fragment } from "react";
import type { RowModel } from "../model/row-model";
import { IconArrowRight, IconChevronRight } from "./icons";

export function EntityRow({ model }: { readonly model: RowModel }): React.ReactElement {
  const { href, cta, leading, title, sub, note, meta, metrics, status, trailing, emphasis } = model;
  const emphasisClass = emphasis ? ` wb-list__row--emphasis wb-emph--${emphasis}` : "";

  const inner = (
    <>
      {leading != null && leading}
      <div className="wb-list__main">
        <span className="wb-list__title">
          {title}
          {sub != null && <span className="wb-list__sub">{sub}</span>}
        </span>
        {note != null && <p className="wb-list__note">{note}</p>}
        {meta && meta.length > 0 && (
          <div className="wb-list__meta">
            {meta.map((m, i) => (
              <Fragment key={m.text}>
                {i > 0 && <span className="wb-dot" />}
                <span className={m.tone ? `wb-tone--${m.tone}` : undefined}>{m.text}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <div className="wb-list__aside">
        {metrics?.map((m) => (
          <span key={m.label} className="wb-list__metric">
            {m.label} <b>{m.value}</b>
          </span>
        ))}
        {status && <span className={`mt-badge mt-badge--${status.tone}`}>{status.label}</span>}
        {trailing}
        {href != null &&
          (cta != null ? (
            <span className="wb-list__cta">
              {cta}
              <IconArrowRight size={15} />
            </span>
          ) : (
            <span className="wb-list__chev">
              <IconChevronRight size={18} />
            </span>
          ))}
      </div>
    </>
  );

  return href != null ? (
    <Link href={href} className={`wb-list__row${emphasisClass}`}>
      {inner}
    </Link>
  ) : (
    <div className={`wb-list__row wb-list__row--static${emphasisClass}`}>{inner}</div>
  );
}
