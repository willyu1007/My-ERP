/**
 * Topbar action slot — a reusable mechanism for a page to inject controls into
 * the shared app-shell topbar (next to the breadcrumb). AppShell exposes the
 * slot element via context; a page renders into it with `TopbarPortal`.
 */
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const TopbarSlotContext = createContext<HTMLElement | null>(null);

export function TopbarPortal({ children }: { readonly children: ReactNode }): React.ReactElement | null {
  const slot = useContext(TopbarSlotContext);
  return slot ? createPortal(children, slot) : null;
}
