/**
 * Report range resolution (T-006 M3c) — pure date helpers shared by the report
 * page (server, resolves the fetch window) and the range picker (client, builds
 * the URL). Statutory reports run over flexible periods: 月 / 季 / 年 / 自定义.
 * The balance sheet is as-of `to`; the income / cash-flow statements cover [from, to].
 */
export type RangeMode = 'month' | 'quarter' | 'year' | 'custom';

export interface ResolvedRange {
  readonly mode: RangeMode;
  /** Inclusive period start, YYYY-MM-DD (IS / CF). */
  readonly from: string;
  /** Inclusive period end, YYYY-MM-DD (BS as-of; IS / CF end). */
  readonly to: string;
  /** Human label, e.g. "2026 年 6 月" / "2026 年 第 2 季度" / "2026 年度". */
  readonly label: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Last day of a 1-based month as YYYY-MM-DD (UTC, no float). */
export function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function monthRange(period: string): ResolvedRange {
  const [y, m] = period.split('-').map(Number);
  return {
    mode: 'month',
    from: `${period}-01`,
    to: lastDayOfMonth(y, m),
    label: `${y} 年 ${m} 月`,
  };
}

export function quarterRange(year: number, quarter: number): ResolvedRange {
  const q = Math.min(4, Math.max(1, quarter));
  const fromMonth = (q - 1) * 3 + 1;
  const toMonth = q * 3;
  return {
    mode: 'quarter',
    from: `${year}-${pad(fromMonth)}-01`,
    to: lastDayOfMonth(year, toMonth),
    label: `${year} 年 第 ${q} 季度`,
  };
}

export function yearRange(year: number): ResolvedRange {
  return { mode: 'year', from: `${year}-01-01`, to: `${year}-12-31`, label: `${year} 年度` };
}

export function customRange(from: string, to: string): ResolvedRange {
  return { mode: 'custom', from, to, label: `${from} 至 ${to}` };
}

/** The quarter (1–4) containing a 1-based month. */
export const quarterOf = (month: number): number => Math.floor((month - 1) / 3) + 1;

/** Resolve a range from URL search params, defaulting to the current month. */
export function resolveRange(
  sp: Record<string, string | undefined>,
  todayPeriod: string,
): ResolvedRange {
  const mode = (sp.mode ?? 'month') as RangeMode;
  if (mode === 'quarter' && sp.y && sp.q) return quarterRange(Number(sp.y), Number(sp.q));
  if (mode === 'year' && sp.y) return yearRange(Number(sp.y));
  if (mode === 'custom' && sp.from && sp.to) return customRange(sp.from, sp.to);
  return monthRange(sp.p ?? todayPeriod);
}
