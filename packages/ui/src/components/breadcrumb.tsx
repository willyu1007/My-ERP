'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbCtx {
  readonly trail: readonly Crumb[];
  readonly setTrail: (t: readonly Crumb[]) => void;
}

const Ctx = createContext<BreadcrumbCtx | null>(null);

export function BreadcrumbProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  const [trail, setTrail] = useState<readonly Crumb[]>([]);
  return <Ctx.Provider value={{ trail, setTrail }}>{children}</Ctx.Provider>;
}

/** Topbar reads the page-supplied trail (the segments beyond the auto section). */
export function useBreadcrumbTrail(): readonly Crumb[] {
  return useContext(Ctx)?.trail ?? [];
}

/**
 * Pages render this (renders nothing) to append crumbs beyond the route-derived
 * section — e.g. a record name on a detail page. Clears on unmount so the topbar
 * falls back to the section alone.
 */
export function SetBreadcrumb({ items }: { readonly items: readonly Crumb[] }): null {
  const ctx = useContext(Ctx);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const key = items.map((i) => `${i.label}|${i.href ?? ''}`).join('>');
  useEffect(() => {
    ctx?.setTrail(itemsRef.current);
    return () => ctx?.setTrail([]);
  }, [ctx, key]);
  return null;
}
