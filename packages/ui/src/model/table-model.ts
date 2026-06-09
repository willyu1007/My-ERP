/**
 * TableModel — the scenario-agnostic contract for the List paradigm's table
 * presentation (for dense, columnar, comparable data). A scenario declares its
 * columns + rows; the presentational `EntityTable` renders + sorts them and
 * carries no domain vocabulary. Parallels CardModel / EntityCard.
 */
import type { ReactNode } from "react";

export type ColumnAlign = "start" | "end" | "center";
export type SortDir = "asc" | "desc";

export interface TableColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly align?: ColumnAlign;
  /** CSS width hint, e.g. "1fr" / "120px". Optional. */
  readonly width?: string;
  /** Cell renderer for a row. */
  readonly render: (row: T) => ReactNode;
  /** Enable header-click sorting on this column. */
  readonly sortable?: boolean;
  /** Comparable value for sorting (required for sortable columns to sort well). */
  readonly sortValue?: (row: T) => string | number;
}

export interface TableModel<T> {
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** Whole-row link → detail (paradigm 铁律). Omit when no detail exists. */
  readonly rowHref?: (row: T) => string | undefined;
}
