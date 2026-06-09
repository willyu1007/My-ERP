/**
 * EntityTable — the table presentation of the List paradigm. Domain-agnostic:
 * it lays out columns × rows, handles header-click sorting, row hover and an
 * optional whole-row link, and nothing else. Scenarios supply columns + rows
 * via a {@link TableModel}. Parallels EntityCard.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SortDir, TableColumn, TableModel } from "../model/table-model";
import { IconChevronDown } from "./icons";

export function EntityTable<T>({ model }: { readonly model: TableModel<T> }): React.ReactElement {
  const { columns, rows, rowKey, rowHref } = model;
  const router = useRouter();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  let display = rows;
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      const get = col.sortValue;
      display = [...rows].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        const r = va < vb ? -1 : va > vb ? 1 : 0;
        return sort.dir === "asc" ? r : -r;
      });
    }
  }

  const onHeader = (c: TableColumn<T>): void => {
    if (!c.sortable) return;
    setSort((s) =>
      s && s.key === c.key
        ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: c.key, dir: "asc" },
    );
  };

  return (
    <div className="wb-table-wrap">
      <table className="wb-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const alignClass = c.align ? ` wb-table__cell--${c.align}` : "";
              const glyph = active ? (
                <span className="wb-table__sort">
                  <IconChevronDown size={12} style={sort.dir === "asc" ? { transform: "rotate(180deg)" } : undefined} />
                </span>
              ) : null;
              return (
                <th
                  key={c.key}
                  className={`wb-table__th${alignClass}`}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortable ? (
                    <button type="button" className="wb-table__sortbtn" onClick={() => onHeader(c)}>
                      {c.label}
                      {glyph}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {display.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className={`wb-table__row${href ? " wb-table__row--link" : ""}`}
                onClick={href ? () => router.push(href) : undefined}
                onKeyDown={
                  href
                    ? (e) => {
                        if (e.key === "Enter") router.push(href);
                      }
                    : undefined
                }
                tabIndex={href ? 0 : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align ? `wb-table__cell--${c.align}` : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
