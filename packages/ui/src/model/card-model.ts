/**
 * CardModel — the scenario-agnostic data contract for the List paradigm's card
 * presentation. A scenario maps its own object to this shape (via a per-entity
 * adapter); the presentational `EntityCard` renders the shape and
 * carries no domain vocabulary. Keep this file types-only.
 */

/** Shared semantic palette for dots and toned meta text. */
export type CardTone = "accent" | "success" | "warning" | "danger" | "muted" | "info";

/** Progress-bar tones (a subset that the Meter primitive supports). */
export type MeterTone = "navy" | "accent" | "success" | "warning";

/** Primary signal of a card — the one thing worth seeing at a glance. */
export type CardPrimary =
  | { readonly kind: "progress"; readonly label: string; readonly value: number; readonly max: number; readonly display?: string; readonly tone?: MeterTone }
  | { readonly kind: "stat"; readonly value: string | number; readonly label?: string }
  | { readonly kind: "text"; readonly text: string; readonly muted?: boolean };

export interface CardMetric {
  readonly label: string;
  readonly value: string | number;
}

export interface CardMetaSegment {
  readonly text: string;
  readonly tone?: CardTone;
}

export interface CardModel {
  /** Whole-card link target (paradigm 铁律: card = 去看 → detail). */
  readonly href: string;
  readonly title: string;
  /** Status as a quiet semantic dot; `hollow` draws a ring (e.g. tentative/draft). */
  readonly status?: { readonly tone: CardTone; readonly label: string; readonly hollow?: boolean };
  /** Top-right context (class / owner / scope). */
  readonly aside?: string;
  readonly primary?: CardPrimary;
  readonly metrics?: readonly CardMetric[];
  readonly meta?: readonly CardMetaSegment[];
  /** Entry affordance label; defaults to "详情". */
  readonly entryLabel?: string;
  /** Controlled variant: a palette-tone attention accent (left edge). Optional. */
  readonly emphasis?: CardTone;
}
