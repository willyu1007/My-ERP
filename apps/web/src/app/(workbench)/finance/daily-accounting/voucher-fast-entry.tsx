'use client';

/**
 * Inline, keyboard-first voucher fast-entry grid (T-004 S1c) — the primary
 * 制单 path, replacing the drawer + separate-page form. Account fuzzy combobox
 * (code/name), Tab/Enter cell flow, single-side-per-line, auto-balance hint, and
 * 暂存 / 提交 (post stays in the review queue, per SoD). Integer-cent math,
 * zero float (借贷必平). Reused as the intake-confirm surface in S5.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { IconMore, Menu, Select, useToast } from '@my-erp/ui';
import type { CashFlowItem, Contract, CreateVoucher } from '@my-erp/api-client';
import { isCashAccountCode } from '@/lib/finance/account';
import { centsToString, sumCents, toCents } from '@/lib/finance/money';
import { formatMoney, formatPeriod } from '@/lib/finance/format';
import type { AccountCategory, AccountVM } from '@/lib/finance/types';
import {
  confirmAction,
  stashDraftAction,
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

type FastEntryDraftPayload = NonNullable<CreateVoucher['draftPayload']>;

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
  return {
    key,
    accountCode: '',
    accountName: '',
    summary: '',
    debit: '',
    credit: '',
    cashFlowItem: '',
  };
}

const CF_GROUPS: readonly { readonly activity: string; readonly label: string }[] = [
  { activity: 'operating', label: '经营活动' },
  { activity: 'investing', label: '投资活动' },
  { activity: 'financing', label: '筹资活动' },
];

const ACCOUNT_CATEGORIES: readonly {
  readonly value: AccountCategory;
  readonly label: string;
}[] = [
  { value: 'asset', label: '资产' },
  { value: 'liability', label: '负债' },
  { value: 'equity', label: '权益' },
  { value: 'cost', label: '成本' },
  { value: 'profitLoss', label: '损益' },
];

const PICKER_GAP = 6;
const PICKER_WIDTH = 820;
const PICKER_HEIGHT = 360;
const VIEWPORT_MARGIN = 12;

function SummaryEditor({
  value,
  invalid,
  onChange,
}: {
  readonly value: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.summaryEditor}
      onBlurCapture={(e) => {
        const nextTarget = e.relatedTarget;
        if (nextTarget instanceof Node && rootRef.current?.contains(nextTarget)) return;
        setOpen(false);
      }}
    >
      <label className={styles.summaryLabel} htmlFor="fe-summary">
        整单摘要
      </label>
      <div className={styles.summaryField}>
        <input
          id="fe-summary"
          className={`mt-input ${styles.summaryInput}${
            invalid ? ` mt-input--error ${styles.requiredInput}` : ''
          }`}
          value={value}
          placeholder={invalid ? '请输入整单摘要' : '如：确认销售收入'}
          aria-invalid={invalid}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
      </div>
      {open ? (
        <textarea
          className={`mt-input ${styles.summaryPanel}${
            invalid ? ` mt-input--error ${styles.requiredInput}` : ''
          }`}
          tabIndex={-1}
          value={value}
          aria-label="整单摘要详情"
          placeholder={invalid ? '请输入整单摘要' : '如：确认销售收入'}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function LineSummaryEditor({
  value,
  registerRef,
  onChange,
}: {
  readonly value: string;
  readonly registerRef: (el: HTMLInputElement | null) => void;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.lineSummaryEditor}
      onBlurCapture={(e) => {
        const nextTarget = e.relatedTarget;
        if (nextTarget instanceof Node && rootRef.current?.contains(nextTarget)) return;
        setOpen(false);
      }}
    >
      <input
        className={`mt-input ${styles.formInput} ${styles.lineSummaryInput}`}
        ref={registerRef}
        value={value}
        aria-label="分录摘要"
        placeholder="分录摘要"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {open ? (
        <textarea
          className={`mt-input ${styles.summaryPanel} ${styles.lineSummaryPanel}`}
          tabIndex={-1}
          value={value}
          aria-label="分录摘要详情"
          placeholder="分录摘要"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function AccountPicker({
  accounts,
  value,
  displayName,
  invalid,
  registerRef,
  onSelect,
  onClear,
  onEnterEmpty,
}: {
  readonly accounts: readonly AccountVM[];
  readonly value: string;
  readonly displayName: string;
  readonly invalid: boolean;
  readonly registerRef: (el: HTMLInputElement | null) => void;
  readonly onSelect: (account: AccountVM) => void;
  readonly onClear: () => void;
  readonly onEnterEmpty: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAccounts = useMemo(() => {
    if (normalizedQuery === '') return accounts;
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(normalizedQuery) ||
        a.name.toLowerCase().includes(normalizedQuery),
    );
  }, [accounts, normalizedQuery]);
  const grouped = useMemo(
    () =>
      ACCOUNT_CATEGORIES.map((c) => ({
        ...c,
        accounts: filteredAccounts.filter((a) => a.category === c.value),
      })).filter((g) => g.accounts.length > 0),
    [filteredAccounts],
  );
  const flatAccounts = useMemo(() => grouped.flatMap((g) => g.accounts), [grouped]);

  const selectedText = value ? `${value} ${displayName}` : '';
  const text = editing ? query : selectedText;

  function setInputRef(el: HTMLInputElement | null): void {
    inputRef.current = el;
    registerRef(el);
  }

  function computePosition(): void {
    const anchor = inputRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(PICKER_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      viewportWidth - width - VIEWPORT_MARGIN,
    );
    const maxHeight = Math.min(PICKER_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
    const measuredHeight = popoverRef.current?.getBoundingClientRect().height ?? maxHeight;
    const panelHeight = Math.min(maxHeight, Math.max(1, measuredHeight));
    const preferredTop =
      placement === 'bottom' ? rect.bottom + PICKER_GAP : rect.top - panelHeight - PICKER_GAP;
    const top = Math.min(
      Math.max(preferredTop, VIEWPORT_MARGIN),
      viewportHeight - panelHeight - VIEWPORT_MARGIN,
    );

    setPopoverStyle({
      position: 'fixed',
      left,
      top,
      width,
      maxHeight,
    });
  }

  function openPicker(): void {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
      const above = rect.top - VIEWPORT_MARGIN;
      setPlacement(below >= PICKER_HEIGHT || below >= above ? 'bottom' : 'top');
    }
    const selectedIndex = flatAccounts.findIndex((a) => a.code === value);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(account: AccountVM): void {
    onSelect(account);
    setQuery('');
    setEditing(false);
    setOpen(false);
  }

  function restoreSelected(): void {
    setQuery('');
    setEditing(false);
  }

  function clearSelection({ keepOpen = false }: { readonly keepOpen?: boolean } = {}): void {
    onClear();
    setQuery('');
    setEditing(false);
    if (keepOpen) {
      setActive(0);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function updateQuery(nextQuery: string): void {
    if (selectedText) onClear();
    setQuery(nextQuery);
    setEditing(true);
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (!editing && selectedText && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      updateQuery(e.key);
    } else if (!editing && selectedText && e.key === 'Backspace') {
      e.preventDefault();
      clearSelection({ keepOpen: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.min(i + 1, flatAccounts.length - 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && flatAccounts[active]) choose(flatAccounts[active]);
      else if (open) onEnterEmpty();
      else openPicker();
    } else if (e.key === 'Escape') {
      if (editing) restoreSelected();
      else setOpen(false);
    } else if (e.key === 'Tab') {
      if (editing) restoreSelected();
      setOpen(false);
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
  }, [open, placement, normalizedQuery, flatAccounts.length, grouped.length]);

  useEffect(() => {
    setActive(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!open) restoreSelected();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (inputRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onFrameChange = (): void => computePosition();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onFrameChange);
    window.addEventListener('scroll', onFrameChange, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onFrameChange);
      window.removeEventListener('scroll', onFrameChange, true);
    };
  }, [open]);

  function onPopoverKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flatAccounts.length - 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatAccounts[active]) {
      e.preventDefault();
      choose(flatAccounts[active]);
    }
  }

  return (
    <div className={styles.combo}>
      <input
        ref={setInputRef}
        className={`mt-input ${styles.formInput}${
          invalid ? ` mt-input--error ${styles.requiredInput}` : ''
        }`}
        value={text}
        placeholder={invalid ? '请选择科目' : '编码或名称'}
        role="combobox"
        aria-invalid={invalid}
        aria-expanded={open}
        aria-controls={open ? 'fe-account-picker' : undefined}
        aria-haspopup="dialog"
        onChange={(e) => {
          const nextValue = e.target.value;
          if (selectedText && nextValue.trim() === '') {
            clearSelection({ keepOpen: true });
          } else if (!editing && selectedText && nextValue.startsWith(selectedText)) {
            updateQuery(nextValue.slice(selectedText.length));
          } else {
            updateQuery(nextValue);
          }
        }}
        onClick={openPicker}
        onFocus={openPicker}
        onKeyDown={onKeyDown}
      />
      {open
        ? createPortal(
            <div
              id="fe-account-picker"
              ref={popoverRef}
              className={styles.accountPicker}
              style={
                popoverStyle ?? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: PICKER_WIDTH,
                  maxHeight: PICKER_HEIGHT,
                  visibility: 'hidden',
                }
              }
              role="dialog"
              aria-label="选择科目"
              onKeyDown={onPopoverKeyDown}
            >
              <div className={styles.accountSections} role="listbox" aria-label="科目">
                {grouped.length === 0 ? <div className={styles.menuEmpty}>无匹配科目</div> : null}
                {grouped.map((g) => (
                  <section key={g.value} className={styles.accountSection}>
                    <h3 className={styles.accountSectionTitle}>{g.label}</h3>
                    <div className={styles.accountOptions}>
                      {g.accounts.map((a) => {
                        const flatIndex = flatAccounts.findIndex((item) => item.id === a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            role="option"
                            aria-selected={flatIndex === active}
                            className={`${styles.accountOption}${
                              flatIndex === active ? ` ${styles.accountOptionActive}` : ''
                            }`}
                            onClick={() => choose(a)}
                            onMouseEnter={() => setActive(flatIndex)}
                          >
                            <span className={styles.optionCode}>{a.code}</span>
                            <span>{a.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
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
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [date, setDate] = useState(initial?.date ?? initialDate);
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [contractId] = useState(initial?.contractId ?? '');
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
  const cashFlowOptions = useMemo(
    () => [
      { value: '', label: '未指定' },
      ...CF_GROUPS.flatMap((g) =>
        cashFlowItems
          .filter((i) => i.activity === g.activity)
          .map((i) => ({ value: i.code, label: `${g.label} · ${i.name}` })),
      ),
    ],
    [cashFlowItems],
  );

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
  const displayDate = date ? date.replaceAll('-', ' - ') : '选择日期';

  function openDatePicker(): void {
    dateInputRef.current?.showPicker?.();
  }

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
    const cashFlowItem = isCashAccountCode(account.code) ? '' : (account.defaultCashFlowItem ?? '');
    updateLine(key, { accountCode: account.code, accountName: account.name, cashFlowItem });
  }

  function lineFormatError(l: DraftLine): string | null {
    const hasDebit = l.debit.trim() !== '';
    const hasCredit = l.credit.trim() !== '';
    if (hasDebit && toCents(l.debit) == null) return '借方金额格式不正确';
    if (hasCredit && toCents(l.credit) == null) return '贷方金额格式不正确';
    if (hasDebit && hasCredit) return '同一分录不能同时填写借方与贷方';
    return null;
  }

  function lineError(l: DraftLine): string | null {
    const formatError = lineFormatError(l);
    if (formatError) return formatError;
    const hasDebit = l.debit.trim() !== '';
    const hasCredit = l.credit.trim() !== '';
    if (l.accountCode !== '' && !hasDebit && !hasCredit) return '请填写借方或贷方金额';
    if (l.accountCode === '' && (hasDebit || hasCredit)) return '请选择科目';
    return null;
  }

  function handleAmountEnter(
    index: number,
    key: string,
    side: 'debit' | 'credit',
    hint: string | null,
  ): void {
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
  const anyFormatError = lines.some((l) => lineFormatError(l) != null);
  const hasContent = lines.some(
    (l) =>
      l.accountCode !== '' ||
      l.summary.trim() !== '' ||
      l.debit.trim() !== '' ||
      l.credit.trim() !== '',
  );
  const summaryOk = summary.trim() !== '';
  const summaryMissing = hasContent && !summaryOk;
  const canStash = hasContent && !anyFormatError && !busy;
  const canSubmit = hasContent && !anyLineError && summaryOk && balanced && !busy;
  const balanceState =
    debitCents === 0 && creditCents === 0
      ? { tone: 'muted', label: '尚未录入金额' }
      : balanced
        ? { tone: 'success', label: '借贷平衡' }
        : {
            tone: 'danger',
            label: `借贷不平 · 差额 ${formatMoney(centsToString(Math.abs(diff)))}`,
          };

  function buildDraftPayload(): FastEntryDraftPayload {
    return {
      version: 1,
      summary,
      contractId: contractId || null,
      lines: lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        summary: l.summary,
        debit: l.debit,
        credit: l.credit,
        cashFlowItem: l.cashFlowItem,
      })),
    };
  }

  function buildInput(kind: 'save' | 'submit'): CreateVoucher {
    const trimmedSummary = summary.trim();
    const fallbackSummary =
      trimmedSummary || lines.find((l) => l.summary.trim() !== '')?.summary.trim() || '暂存凭证';
    return {
      date,
      summary: kind === 'submit' ? trimmedSummary : fallbackSummary,
      ...(contractId ? { contractId } : {}),
      draftPayload: buildDraftPayload(),
      lines: lines
        .filter((l) => l.accountCode !== '')
        .map((l) => ({
          accountCode: l.accountCode,
          summary: l.summary.trim() || trimmedSummary,
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
      const input = buildInput(kind);
      let res: SaveResult;
      if (voucherId) {
        res =
          kind === 'submit'
            ? await confirmAction(voucherId, input)
            : await updateDraftAction(voucherId, input);
      } else {
        res = kind === 'submit' ? await submitNewAction(input) : await stashDraftAction(input);
      }
      if (res.ok) {
        toast.notify('success', res.submitted ? '已提交待审核' : '已暂存', res.no);
        if (voucherId) {
          if (res.submitted) router.push('/finance/daily-accounting');
          else router.refresh();
        } else {
          reset();
          router.refresh();
        }
      } else if (res.reason === 'unconfigured') {
        toast.notify(
          'info',
          '演示模式',
          '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可真实保存）',
        );
      } else {
        toast.notify('error', '保存失败', res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <div className={styles.topbar}>
        <div className={styles.titleGroup}>
          <h2 className="wb-card__title">{voucherId ? '确认凭证' : '制单'}</h2>
          <div className={styles.metaField}>
            <button
              type="button"
              className={styles.dateButton}
              aria-label={`凭证日期 ${displayDate}`}
              onClick={openDatePicker}
            >
              {displayDate}
            </button>
            <input
              ref={dateInputRef}
              className={styles.nativeDateInput}
              aria-hidden="true"
              tabIndex={-1}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <span className={styles.periodText}>会计期间 {period}</span>
        </div>
        <div className={styles.topActions}>
          <Menu label="更多操作" align="start" trigger={<IconMore size={18} aria-hidden="true" />}>
            <button type="button" className="mt-menu-item" disabled>
              关联合同
            </button>
          </Menu>
          {headerAction ? <div className={styles.headerAction}>{headerAction}</div> : null}
        </div>
      </div>

      <div className={styles.entryMetaRow}>
        <div className={styles.amountStatus}>
          <span className={styles.totalPair}>
            <span className="wb-muted">借方合计</span>
            <span className="wb-mono">{formatMoney(centsToString(debitCents))}</span>
          </span>
          <span className={styles.totalPair}>
            <span className="wb-muted">贷方合计</span>
            <span className="wb-mono">{formatMoney(centsToString(creditCents))}</span>
          </span>
          <span className={`${styles.balanceState} ${styles[`balanceState_${balanceState.tone}`]}`}>
            <span className={styles.balanceStateDot} aria-hidden="true" />
            {balanceState.label}
          </span>
        </div>
        <SummaryEditor value={summary} invalid={summaryMissing} onChange={setSummary} />
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
          const amountMissing = err === '请填写借方或贷方金额';
          const accountMissing = err === '请选择科目';
          const isEmptyAmounts = l.debit.trim() === '' && l.credit.trim() === '';
          const debitHint = isEmptyAmounts && diff < 0 ? centsToString(-diff) : null;
          const creditHint = isEmptyAmounts && diff > 0 ? centsToString(diff) : null;
          return (
            <div key={l.key}>
              <div className={styles.row}>
                <div className={styles.cell}>
                  <AccountPicker
                    accounts={postable}
                    value={l.accountCode}
                    displayName={l.accountName}
                    invalid={accountMissing}
                    registerRef={setFieldRef(`${l.key}:account`)}
                    onSelect={(a) => selectAccount(l.key, a)}
                    onClear={() =>
                      updateLine(l.key, { accountCode: '', accountName: '', cashFlowItem: '' })
                    }
                    onEnterEmpty={() => setPendingFocus(`${l.key}:summary`)}
                  />
                </div>
                <div className={styles.cell}>
                  <LineSummaryEditor
                    value={l.summary}
                    registerRef={setFieldRef(`${l.key}:summary`)}
                    onChange={(value) => updateLine(l.key, { summary: value })}
                  />
                </div>
                <div className={styles.cell}>
                  <input
                    className={`mt-input ${styles.formInput}${
                      err === '借方金额格式不正确' || amountMissing ? ' mt-input--error' : ''
                    }`}
                    ref={setFieldRef(`${l.key}:debit`)}
                    inputMode="decimal"
                    value={l.debit}
                    placeholder={debitHint ?? '0.00'}
                    aria-invalid={err === '借方金额格式不正确' || amountMissing}
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
                    className={`mt-input ${styles.formInput}${
                      err === '贷方金额格式不正确' || amountMissing ? ' mt-input--error' : ''
                    }`}
                    ref={setFieldRef(`${l.key}:credit`)}
                    inputMode="decimal"
                    value={l.credit}
                    placeholder={creditHint ?? '0.00'}
                    aria-invalid={err === '贷方金额格式不正确' || amountMissing}
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
                  <Select
                    value={l.cashFlowItem}
                    ariaLabel="现金流量项目"
                    options={cashFlowOptions}
                    onChange={(value) => setCashFlowItem(l.key, value)}
                  />
                </div>
              )}
              {err && !amountMissing && !accountMissing ? (
                <p className="mt-help mt-help--error">{err}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={styles.actionBar}>
        <div className={styles.actionGroup}>
          <button
            type="button"
            className="mt-btn mt-btn--secondary mt-btn--sm"
            onClick={() => addLine()}
          >
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
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={`mt-btn mt-btn--secondary ${styles.primaryAction}${
              canStash ? '' : ' mt-btn--disabled'
            }`}
            onClick={() => run('save')}
            disabled={!canStash}
          >
            暂存
          </button>
          <button
            type="button"
            className={`mt-btn mt-btn--primary ${styles.primaryAction}${
              canSubmit ? '' : ' mt-btn--disabled'
            }`}
            onClick={() => run('submit')}
            disabled={!canSubmit}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
