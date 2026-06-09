'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Badge, Breadcrumb, useToast } from '@my-erp/ui';
import { formatMoney, formatPeriod } from '@/lib/finance/format';
import { centsToString, sumCents, toCents } from '@/lib/finance/money';
import type { AccountVM } from '@/lib/finance/types';

/**
 * 制单 — form 模板。前端借贷平衡校验（借贷必平，整数分精确计算，零浮点）；不平或
 * 分录有误时禁止提交并给出 field 级错误。W1 保存为演示草稿（toast，不持久化）。
 * 真实状态机与服务层不变式在 M1 P3 落地。
 */
interface DraftLine {
  key: string;
  accountCode: string;
  summary: string;
  debit: string;
  credit: string;
}

function blankLine(key: string): DraftLine {
  return { key, accountCode: '', summary: '', debit: '', credit: '' };
}

export function NewVoucherClient({ accounts }: { readonly accounts: readonly AccountVM[] }) {
  const toast = useToast();
  const idRef = useRef(2);
  const [date, setDate] = useState('2026-06-10');
  const [summary, setSummary] = useState('');
  const [summaryTouched, setSummaryTouched] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine('line-0'), blankLine('line-1')]);

  const periodLabel = date ? formatPeriod(date.slice(0, 7)) : '—';

  const debitCents = sumCents(lines.map((l) => l.debit));
  const creditCents = sumCents(lines.map((l) => l.credit));
  const balanced = debitCents === creditCents && debitCents > 0;
  const diffCents = Math.abs(debitCents - creditCents);
  const noAmounts = debitCents === 0 && creditCents === 0;
  const summaryError = summaryTouched && summary.trim() === '';

  function lineError(l: DraftLine): string | null {
    const hasDebit = l.debit.trim() !== '';
    const hasCredit = l.credit.trim() !== '';
    if (hasDebit && toCents(l.debit) == null) return '借方金额格式不正确';
    if (hasCredit && toCents(l.credit) == null) return '贷方金额格式不正确';
    if (hasDebit && hasCredit) return '同一分录不能同时填写借方与贷方';
    if (l.accountCode !== '' && !hasDebit && !hasCredit) return '请填写借方或贷方金额';
    if (l.accountCode === '' && (hasDebit || hasCredit)) return '请选择科目';
    return null;
  }

  const anyLineError = lines.some((l) => lineError(l) != null);
  const hasContent = lines.some((l) => l.accountCode !== '');
  const canSubmit = balanced && !anyLineError && hasContent && summary.trim() !== '';

  function updateLine(key: string, patch: Partial<DraftLine>): void {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine(): void {
    setLines((ls) => [...ls, blankLine(`line-${idRef.current++}`)]);
  }
  function removeLine(key: string): void {
    setLines((ls) => (ls.length <= 2 ? ls : ls.filter((l) => l.key !== key)));
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (!canSubmit) return;
    toast.notify(
      'success',
      '已保存草稿（演示）',
      `${lines.filter((l) => l.accountCode !== '').length} 条分录，合计 ${formatMoney(centsToString(debitCents))}`,
    );
  }

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Breadcrumb items={[{ label: '记账凭证', href: '/finance/vouchers' }, { label: '新增凭证' }]} />

      <div className="mt-card">
        <form className="wb-form" onSubmit={submit}>
          <div className="wb-form__row">
            <div className="mt-field">
              <label className="mt-label" htmlFor="v-date">日期</label>
              <input id="v-date" className="mt-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="mt-field">
              <label className="mt-label" htmlFor="v-period">会计期间</label>
              <input id="v-period" className="mt-input" value={periodLabel} readOnly />
            </div>
          </div>

          <div className="mt-field">
            <label className="mt-label" htmlFor="v-summary">摘要</label>
            <input
              id="v-summary"
              className={`mt-input${summaryError ? ' mt-input--error' : ''}`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() => setSummaryTouched(true)}
              placeholder="整单摘要，如：确认销售收入"
            />
            {summaryError && <p className="mt-help mt-help--error">请填写摘要</p>}
          </div>

          <div className="wb-stack wb-stack--sm">
            <p className="mt-label">分录</p>
            {lines.map((l) => {
              const err = lineError(l);
              return (
                <div key={l.key} className="wb-stack wb-stack--sm">
                  <div className="wb-form__row">
                    <div className="mt-field">
                      <label className="mt-label" htmlFor={`acct-${l.key}`}>科目</label>
                      <select
                        id={`acct-${l.key}`}
                        className={`mt-select${err === '请选择科目' ? ' mt-input--error' : ''}`}
                        value={l.accountCode}
                        onChange={(e) => updateLine(l.key, { accountCode: e.target.value })}
                      >
                        <option value="">选择科目</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.code}>
                            {a.code} {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-field">
                      <label className="mt-label" htmlFor={`summary-${l.key}`}>摘要</label>
                      <input
                        id={`summary-${l.key}`}
                        className="mt-input"
                        value={l.summary}
                        onChange={(e) => updateLine(l.key, { summary: e.target.value })}
                      />
                    </div>
                    <div className="mt-field">
                      <label className="mt-label" htmlFor={`debit-${l.key}`}>借方</label>
                      <input
                        id={`debit-${l.key}`}
                        className={`mt-input${err && l.debit.trim() !== '' ? ' mt-input--error' : ''}`}
                        inputMode="decimal"
                        value={l.debit}
                        onChange={(e) => updateLine(l.key, { debit: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="mt-field">
                      <label className="mt-label" htmlFor={`credit-${l.key}`}>贷方</label>
                      <input
                        id={`credit-${l.key}`}
                        className={`mt-input${err && l.credit.trim() !== '' ? ' mt-input--error' : ''}`}
                        inputMode="decimal"
                        value={l.credit}
                        onChange={(e) => updateLine(l.key, { credit: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      type="button"
                      className="mt-btn mt-btn--ghost mt-btn--sm"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length <= 2}
                    >
                      删除
                    </button>
                  </div>
                  {err && <p className="mt-help mt-help--error">{err}</p>}
                </div>
              );
            })}
            <div className="wb-row">
              <button type="button" className="mt-btn mt-btn--secondary mt-btn--sm" onClick={addLine}>
                + 添加分录
              </button>
            </div>
          </div>

          <div className="wb-row wb-row--wrap">
            <span className="wb-muted">借方合计</span>
            <span className="wb-mono">{formatMoney(centsToString(debitCents))}</span>
            <span className="wb-muted">贷方合计</span>
            <span className="wb-mono">{formatMoney(centsToString(creditCents))}</span>
            {noAmounts ? (
              <Badge tone="muted" dot>尚未录入金额</Badge>
            ) : (
              <Badge tone={balanced ? 'success' : 'danger'} dot>
                {balanced ? '借贷平衡' : `借贷不平 · 差额 ${formatMoney(centsToString(diffCents))}`}
              </Badge>
            )}
          </div>

          <div className="wb-row">
            <button type="submit" className={`mt-btn mt-btn--primary${canSubmit ? '' : ' mt-btn--disabled'}`} disabled={!canSubmit}>
              保存草稿
            </button>
            <Link href="/finance/vouchers" className="mt-btn mt-btn--ghost">
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
