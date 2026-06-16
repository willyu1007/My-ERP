'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { quarterOf, type RangeMode, type ResolvedRange } from '@/lib/finance/report-range';
import styles from './reports.module.css';

const MODES: readonly { readonly key: RangeMode; readonly label: string }[] = [
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季' },
  { key: 'year', label: '年' },
  { key: 'custom', label: '自定义' },
];

/**
 * Report period picker (T-006 M3c). Switches the resolved [from, to] window via
 * the URL (the server page re-fetches). 月/季/年/自定义 per the D4 decision; the
 * balance sheet reads `to` as its as-of date.
 */
export function ReportRangePicker({ range }: { readonly range: ResolvedRange }) {
  const router = useRouter();
  const [mode, setMode] = useState<RangeMode>(range.mode);
  const [month, setMonth] = useState(range.from.slice(0, 7));
  const [year, setYear] = useState(Number(range.from.slice(0, 4)));
  const [quarter, setQuarter] = useState(quarterOf(Number(range.from.slice(5, 7))));
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  function apply(): void {
    const p = new URLSearchParams({ mode });
    if (mode === 'month') p.set('p', month);
    else if (mode === 'quarter') {
      p.set('y', String(year));
      p.set('q', String(quarter));
    } else if (mode === 'year') p.set('y', String(year));
    else {
      p.set('from', from);
      p.set('to', to);
    }
    router.push(`/finance/reports?${p.toString()}`);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.modes} role="tablist" aria-label="报表期间类型">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            className={`${styles.mode} ${mode === m.key ? styles.modeActive : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className={styles.inputs}>
        {mode === 'month' && (
          <input
            type="month"
            className={styles.input}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="月份"
          />
        )}
        {mode === 'quarter' && (
          <>
            <input
              type="number"
              className={styles.input}
              value={year}
              min={2000}
              max={2999}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="年份"
            />
            <select
              className={styles.input}
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              aria-label="季度"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>{`第 ${q} 季度`}</option>
              ))}
            </select>
          </>
        )}
        {mode === 'year' && (
          <input
            type="number"
            className={styles.input}
            value={year}
            min={2000}
            max={2999}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="年份"
          />
        )}
        {mode === 'custom' && (
          <>
            <input
              type="date"
              className={styles.input}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="起始日期"
            />
            <span className={styles.sep}>至</span>
            <input
              type="date"
              className={styles.input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="截止日期"
            />
          </>
        )}
        <button type="button" className="mt-btn mt-btn--primary mt-btn--sm" onClick={apply}>
          查看报表
        </button>
      </div>
    </div>
  );
}
