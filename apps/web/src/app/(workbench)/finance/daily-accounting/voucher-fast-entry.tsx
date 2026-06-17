'use client';

/**
 * Inline, keyboard-first voucher fast-entry grid (T-004 S1c) — the primary
 * 制单 path, replacing the drawer + separate-page form. Account fuzzy combobox
 * (code/name), Tab/Enter cell flow, single-side-per-line, auto-balance hint, and
 * 保存草稿 / 提交 (post stays in the review queue, per SoD). Integer-cent math,
 * zero float (借贷必平). Reused as the intake-confirm surface in S5.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge, useToast } from '@my-erp/ui';
import type { CashFlowItem, Contract, CreateVoucher } from '@my-erp/api-client';
import { isCashAccountCode } from '@/lib/finance/account';
import { centsToString, sumCents, toCents } from '@/lib/finance/money';
import { formatMoney, formatPeriod } from '@/lib/finance/format';
import type { AccountVM } from '@/lib/finance/types';
import {
  confirmAction,
  saveDraftAction,
  submitNewAction,
  updateDraftAction,
  type SaveResult,
} from './actions';
import styles from './voucher-fast-entry.module.css';

/** A prefilled draft (edit/confirm mode) — e.g. a capture-generated voucher draft. */
export interface FastEntryInitial {
  readonly date: string;
  readonly summary: string;
  readonly contractId?: string | null;
  readonly lines: readonly {
    readonly accountCode: string;
    readonly accountName: string;
    readonly summary: string;
    readonly debit: string;
    readonly credit: string;
    readonly cashFlowItem?: string;
  }[];
}

interface DraftLine {
  key: string;
  accountCode: string;
  accountName: string;
  summary: string;
  debit: string;
  credit: string;
  cashFlowItem: string;
}

function blankLine(key: string): DraftLine {
  return { key, accountCode: '', accountName: '', summary: '', debit: '', credit: '', cashFlowItem: '' };
}

const CF_GROUPS: readonly { readonly activity: string; readonly label: string }[] = [
  { activity: 'operating', label: '经营活动' },
  { activity: 'investing', label: '投资活动' },
  { activity: 'financing', label: '筹资活动' },
];

function AccountCombobox({
  accounts,
  value,
  displayName,
  registerRef,
  onSelect,
  onEnterEmpty,
}: {
  readonly accounts: readonly AccountVM[];
  readonly value: string;
  readonly displayName: string;
  readonly registerRef: (el: HTMLInputElement | null) => void;
  readonly onSelect: (account: AccountVM) => void;
  readonly onEnterEmpty: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base =
      q === ''
        ? accounts
        : accounts.filter(
            (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
          );
    return base.slice(0, 50);
  }, [accounts, query]);

  const text = open ? query : value ? `${value} ${displayName}` : '';

  function choose(account: AccountVM): void {
    onSelect(account);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        choose(filtered[active]);
      } else {
        onEnterEmpty();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.combo}>
      <input
        ref={registerRef}
        className="mt-input"
        value={text}
        placeholder="编码或名称"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className={styles.menu} role="listbox">
          {filtered.length === 0 ? (
            <div className={styles.menuEmpty}>无匹配科目</div>
          ) : (
            filtered.map((a, i) => (
              <div
                key={a.id}
                role="option"
                aria-selected={i === active}
                className={`${styles.option}${i === active ? ` ${styles.optionActive}` : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(a);
                }}
              >
                <span className={styles.optionCode}>{a.code}</span>
                <span>{a.name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function VoucherFastEntry({
  accounts,
  initialDate,
  voucherId,
  initial,
  headerAction,
  cashFlowItems = [],
  contracts = [],
}: {
  readonly accounts: readonly AccountVM[];
  readonly initialDate: string;
  /** When set, the editor confirms an existing draft (PATCH then submit) instead of creating one. */
  readonly voucherId?: string;
  /** Prefilled draft for edit/confirm mode (e.g. a capture-generated voucher). */
  readonly initial?: FastEntryInitial;
  /** Optional control rendered in the header (e.g. the capture/upload button). */
  readonly headerAction?: ReactNode;
  /** 现金流量项目主数据 — 现金凭证的非现金分录可打标（D1/D2，空则不显示打标）。 */
  readonly cashFlowItems?: readonly CashFlowItem[];
  /** 合同主数据 — 录入时可关联（T-005 entry-time linking；空则不显示）。 */
  readonly contracts?: readonly Contract[];
}) {
  const toast = useToast();
  const router = useRouter();
  const idRef = useRef(initial ? Math.max(2, initial.lines.length) : 2);
  const fieldRefs = useRef(new Map<string, HTMLInputElement | null>());
  const [date, setDate] = useState(initial?.date ?? initialDate);
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [contractId, setContractId] = useState(initial?.contractId ?? '');
  const openContracts = contracts.filter((c) => c.status !== 'closed');
  const [lines, setLines] = useState<DraftLine[]>(() => {
    if (!initial) return [blankLine('line-0'), blankLine('line-1')];
    const seeded: DraftLine[] = initial.lines.map((l, i) => ({
      key: `line-${i}`,
      accountCode: l.accountCode,
      accountName: l.accountName,
      summary: l.summary,
      debit: l.debit,
      credit: l.credit,
      cashFlowItem: l.cashFlowItem ?? '',
    }));
    while (seeded.length < 2) seeded.push(blankLine(`line-${seeded.length}`));
    return seeded;
  });
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only leaf + active accounts can carry postings.
  const postable = useMemo(() => accounts.filter((a) => a.isLeaf && a.active), [accounts]);

  // CF tagging (D1): only on the NON-cash (contra) lines of a 现金凭证, and only
  // when the CF-item master is loaded. A single cash line can't carry the CF nature.
  const cfEnabled = cashFlowItems.length > 0;
  const isCashVoucher = lines.some((l) => l.accountCode && isCashAccountCode(l.accountCode));
  const showCfFor = (l: DraftLine): boolean =>
    cfEnabled && isCashVoucher && l.accountCode !== '' && !isCashAccountCode(l.accountCode);

  const debitCents = sumCents(lines.map((l) => l.debit));
  const creditCents = sumCents(lines.map((l) => l.credit));
  const diff = debitCents - creditCents; // >0 → need credit; <0 → need debit
  const balanced = diff === 0 && debitCents > 0;
  const period = date ? formatPeriod(date.slice(0, 7)) : '—';

  useEffect(() => {
    if (pendingFocus) {
      fieldRefs.current.get(pendingFocus)?.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus]);

  function setFieldRef(key: string) {
    return (el: HTMLInputElement | null): void => {
      fieldRefs.current.set(key, el);
    };
  }

  function updateLine(key: string, patch: Partial<DraftLine>): void {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function setDebit(key: string, v: string): void {
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, debit: v, credit: v.trim() ? '' : l.credit } : l)),
    );
  }
  function setCredit(key: string, v: string): void {
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, credit: v, debit: v.trim() ? '' : l.debit } : l)),
    );
  }
  function addLine(): string {
    const key = `line-${idRef.current++}`;
    setLines((ls) => [...ls, blankLine(key)]);
    return key;
  }
  function removeLine(key: string): void {
    setLines((ls) => (ls.length <= 2 ? ls : ls.filter((l) => l.key !== key)));
  }
  function setCashFlowItem(key: string, v: string): void {
    updateLine(key, { cashFlowItem: v });
  }
  function selectAccount(key: string, account: AccountVM): void {
    // Auto-suggest (D2): a non-cash account's chart default pre-fills the CF item,
    // editable. Picking a cash account clears any tag (cash lines aren't tagged).
    const cashFlowItem = isCashAccountCode(account.code) ? '' : account.defaultCashFlowItem ?? '';
    updateLine(key, { accountCode: account.code, accountName: account.name, cashFlowItem });
    setPendingFocus(`${key}:debit`);
  }

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

  function handleAmountEnter(index: number, key: string, side: 'debit' | 'credit', hint: string | null): void {
    const line = lines[index];
    const empty = side === 'debit' ? line.debit.trim() === '' : line.credit.trim() === '';
    if (empty && hint) {
      if (side === 'debit') setDebit(key, hint);
      else setCredit(key, hint);
      return;
    }
    if (index === lines.length - 1) setPendingFocus(`${addLine()}:account`);
    else setPendingFocus(`${lines[index + 1].key}:account`);
  }

  function balanceFill(): void {
    if (diff === 0) return;
    const side: 'debit' | 'credit' = diff > 0 ? 'credit' : 'debit';
    const amount = centsToString(Math.abs(diff));
    const target = lines.find((l) => l.debit.trim() === '' && l.credit.trim() === '');
    if (target) updateLine(target.key, { [side]: amount });
    else {
      const key = addLine();
      setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [side]: amount } : l)));
    }
  }

  const anyLineError = lines.some((l) => lineError(l) != null);
  const hasContent = lines.some((l) => l.accountCode !== '');
  const summaryOk = summary.trim() !== '';
  const canSave = hasContent && !anyLineError && summaryOk && !busy;
  const canSubmit = canSave && balanced;

  function buildInput(): CreateVoucher {
    return {
      date,
      summary: summary.trim(),
      ...(contractId ? { contractId } : {}),
      lines: lines
        .filter((l) => l.accountCode !== '')
        .map((l) => ({
          accountCode: l.accountCode,
          summary: l.summary.trim() || summary.trim(),
          ...(l.debit.trim() ? { debit: centsToString(toCents(l.debit) ?? 0) } : {}),
          ...(l.credit.trim() ? { credit: centsToString(toCents(l.credit) ?? 0) } : {}),
          ...(showCfFor(l) && l.cashFlowItem ? { cashFlowItem: l.cashFlowItem } : {}),
        })),
    };
  }

  function reset(): void {
    idRef.current = 2;
    setSummary('');
    setLines([blankLine('line-0'), blankLine('line-1')]);
  }

  async function run(kind: 'save' | 'submit'): Promise<void> {
    setBusy(true);
    try {
      const input = buildInput();
      let res: SaveResult;
      if (voucherId) {
        res = kind === 'submit' ? await confirmAction(voucherId, input) : await updateDraftAction(voucherId, input);
      } else {
        res = kind === 'submit' ? await submitNewAction(input) : await saveDraftAction(input);
      }
      if (res.ok) {
        toast.notify('success', res.submitted ? '已提交待审核' : voucherId ? '已保存' : '已保存草稿', res.no);
        if (voucherId) {
          if (res.submitted) router.push('/finance/daily-accounting');
          else router.refresh();
        } else {
          reset();
          router.refresh();
        }
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可真实保存）');
      } else {
        toast.notify('error', '保存失败', res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <div className="wb-row wb-row--wrap">
        <h2 className="wb-card__title">{voucherId ? '确认凭证' : '快速制单'}</h2>
        <div className="mt-field">
          <label className="mt-label" htmlFor="fe-date">
            日期
          </label>
          <input
            id="fe-date"
            className="mt-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <span className="wb-muted">会计期间 {period}</span>
        {openContracts.length > 0 && (
          <div className="mt-field">
            <label className="mt-label" htmlFor="fe-contract">
              关联合同
            </label>
            <select
              id="fe-contract"
              className="mt-select"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              <option value="">不关联</option>
              {openContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {headerAction}
      </div>

      <div className="mt-field">
        <label className="mt-label" htmlFor="fe-summary">
          整单摘要
        </label>
        <input
          id="fe-summary"
          className="mt-input"
          value={summary}
          placeholder="如：确认销售收入"
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>

      <div className={styles.grid}>
        <div className={styles.head}>
          <span>科目</span>
          <span>摘要</span>
          <span>借方</span>
          <span>贷方</span>
          <span />
        </div>
        {lines.map((l, index) => {
          const err = lineError(l);
          const isEmptyAmounts = l.debit.trim() === '' && l.credit.trim() === '';
          const debitHint = isEmptyAmounts && diff < 0 ? centsToString(-diff) : null;
          const creditHint = isEmptyAmounts && diff > 0 ? centsToString(diff) : null;
          return (
            <div key={l.key}>
              <div className={styles.row}>
                <div className={styles.cell}>
                  <AccountCombobox
                    accounts={postable}
                    value={l.accountCode}
                    displayName={l.accountName}
                    registerRef={setFieldRef(`${l.key}:account`)}
                    onSelect={(a) => selectAccount(l.key, a)}
                    onEnterEmpty={() => setPendingFocus(`${l.key}:summary`)}
                  />
                </div>
                <div className={styles.cell}>
                  <input
                    className="mt-input"
                    ref={setFieldRef(`${l.key}:summary`)}
                    value={l.summary}
                    placeholder="分录摘要"
                    onChange={(e) => updateLine(l.key, { summary: e.target.value })}
                  />
                </div>
                <div className={styles.cell}>
                  <input
                    className={`mt-input${err === '借方金额格式不正确' ? ' mt-input--error' : ''}`}
                    ref={setFieldRef(`${l.key}:debit`)}
                    inputMode="decimal"
                    value={l.debit}
                    placeholder={debitHint ?? '0.00'}
                    onChange={(e) => setDebit(l.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAmountEnter(index, l.key, 'debit', debitHint);
                      }
                    }}
                  />
                </div>
                <div className={styles.cell}>
                  <input
                    className={`mt-input${err === '贷方金额格式不正确' ? ' mt-input--error' : ''}`}
                    ref={setFieldRef(`${l.key}:credit`)}
                    inputMode="decimal"
                    value={l.credit}
                    placeholder={creditHint ?? '0.00'}
                    onChange={(e) => setCredit(l.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAmountEnter(index, l.key, 'credit', creditHint);
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={`mt-btn mt-btn--ghost mt-btn--sm ${styles.del}`}
                  onClick={() => removeLine(l.key)}
                  disabled={lines.length <= 2}
                >
                  删除
                </button>
              </div>
              {showCfFor(l) && (
                <div className={styles.cfRow}>
                  <span className={styles.cfLabel}>现金流量项目</span>
                  <select
                    className={styles.cfSelect}
                    value={l.cashFlowItem}
                    aria-label="现金流量项目"
                    onChange={(e) => setCashFlowItem(l.key, e.target.value)}
                  >
                    <option value="">（未指定）</option>
                    {CF_GROUPS.map((g) => {
                      const items = cashFlowItems.filter((i) => i.activity === g.activity);
                      return items.length === 0 ? null : (
                        <optgroup key={g.activity} label={g.label}>
                          {items.map((i) => (
                            <option key={i.code} value={i.code}>
                              {i.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}
              {err && <p className="mt-help mt-help--error">{err}</p>}
            </div>
          );
        })}
        <div className="wb-row">
          <button type="button" className="mt-btn mt-btn--secondary mt-btn--sm" onClick={() => addLine()}>
            + 添加分录
          </button>
          <button
            type="button"
            className="mt-btn mt-btn--ghost mt-btn--sm"
            onClick={balanceFill}
            disabled={diff === 0}
          >
            一键配平
          </button>
        </div>
      </div>

      <div className={styles.totals}>
        <span className="wb-muted">借方合计</span>
        <span className="wb-mono">{formatMoney(centsToString(debitCents))}</span>
        <span className="wb-muted">贷方合计</span>
        <span className="wb-mono">{formatMoney(centsToString(creditCents))}</span>
        {debitCents === 0 && creditCents === 0 ? (
          <StatusBadge tone="muted" dot label="尚未录入金额" />
        ) : (
          <StatusBadge
            tone={balanced ? 'success' : 'danger'}
            dot
            label={balanced ? '借贷平衡' : `借贷不平 · 差额 ${formatMoney(centsToString(Math.abs(diff)))}`}
          />
        )}
      </div>

      <div className="wb-row">
        <button
          type="button"
          className={`mt-btn mt-btn--primary${canSubmit ? '' : ' mt-btn--disabled'}`}
          onClick={() => run('submit')}
          disabled={!canSubmit}
        >
          提交
        </button>
        <button
          type="button"
          className={`mt-btn mt-btn--secondary${canSave ? '' : ' mt-btn--disabled'}`}
          onClick={() => run('save')}
          disabled={!canSave}
        >
          保存草稿
        </button>
      </div>
    </div>
  );
}
