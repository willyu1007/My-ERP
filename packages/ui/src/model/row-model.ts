/**
 * RowModel — the scenario-agnostic contract for the List paradigm's row
 * presentation (and Queue rows). A scenario maps its object to this shape; the
 * presentational `EntityRow` renders it. Parallels CardModel / TableModel.
 *
 * `href` (List: whole-row → detail, renders a chevron) and `trailing` (Queue:
 * inline action buttons) are mutually exclusive in practice — that is exactly
 * the paradigm 铁律 "chevron = 去看 / button = 去做".
 */
import type { ReactNode } from "react";
import type { CardTone } from "./card-model";

export interface RowMeta {
  readonly text: string;
  readonly tone?: CardTone;
}

export interface RowMetric {
  readonly label: string;
  readonly value: ReactNode;
}

export interface RowModel {
  /** List: whole-row link → detail (auto chevron + hover). */
  readonly href?: string;
  /** With `href`, replaces the chevron with a labelled call-to-action ("去批改 →"). */
  readonly cta?: string;
  /** Avatar / status dot / icon at the row start. */
  readonly leading?: ReactNode;
  readonly title: ReactNode;
  /** Inline secondary identifier after the title (e.g. #ref). */
  readonly sub?: ReactNode;
  readonly meta?: readonly RowMeta[];
  /** A secondary preview line under the title (e.g. a feedback summary), clamped. */
  readonly note?: ReactNode;
  /** Trailing inline metrics (score / counts). */
  readonly metrics?: readonly RowMetric[];
  /** Trailing status badge (tone source shared with cards/tables). */
  readonly status?: { readonly tone: CardTone; readonly label: string };
  /** Escape hatch: Queue action buttons / custom trailing content. */
  readonly trailing?: ReactNode;
  /** Controlled variant: a palette-tone attention accent (left edge). Optional. */
  readonly emphasis?: CardTone;
}
