"use client";

import { useState, type ReactNode } from "react";

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
  readonly content: ReactNode;
}

export function Tabs({
  items,
  initialKey,
}: {
  readonly items: readonly TabItem[];
  readonly initialKey?: string;
}): React.ReactElement {
  const [active, setActive] = useState(initialKey ?? items[0]?.key ?? "");
  const current = items.find((t) => t.key === active) ?? items[0];

  return (
    <div>
      <div className="wb-segmented" role="tablist" style={{ marginBottom: 24 }}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === active}
            className={`wb-segmented__item${item.key === active ? " wb-segmented__item--active" : ""}`}
            onClick={() => setActive(item.key)}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span className="wb-segmented__count">{item.count}</span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
