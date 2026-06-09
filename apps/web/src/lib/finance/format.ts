/**
 * Display formatting for finance VMs. Pure string helpers (no React, no float).
 */

/** Group a canonical 2dp amount string with thousands separators: "1234.5" → "1,234.50". */
export function formatMoney(amount: string): string {
  const [intPart, fracPart = '00'] = amount.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = fracPart.padEnd(2, '0').slice(0, 2);
  return `${sign}${grouped}.${frac}`;
}

/** ISO date passthrough (kept as YYYY-MM-DD for the accounting register). */
export function formatDate(iso: string): string {
  return iso;
}

/** "2026-06" → "2026 年 6 月". */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  return `${year} 年 ${Number(month)} 月`;
}
