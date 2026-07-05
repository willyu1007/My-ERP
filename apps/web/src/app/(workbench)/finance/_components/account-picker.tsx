'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { AccountCategory, AccountVM } from '@/lib/finance/types';
import styles from './account-picker.module.css';

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
const PICKER_HEIGHT = 400;
const PICKER_COMPACT_WIDTH = 320;
const PICKER_COMPACT_HEIGHT = 260;
const VIEWPORT_MARGIN = 12;
const COMMON_LIMIT = 10;
const RECENT_LIMIT = 8;

/** Display-only picker preferences (T-012 D5) — never affect validity/posting. */
export interface AccountPickerPreferences {
  /** Ledger default (team) recommended codes. */
  readonly recommended?: readonly string[];
  /** Personal pinned/favorite codes. */
  readonly pinned?: readonly string[];
  /** Personal hidden/less-shown codes (still searchable/selectable). */
  readonly hidden?: readonly string[];
}

export interface AccountPickerProps {
  /**
   * Accounts to offer. The progressive (grouped) variant accepts the whole
   * subtree including branch rows for browsing; only active leaves are
   * selectable. The compact variant expects a pre-filtered flat list.
   */
  readonly accounts: readonly AccountVM[];
  readonly value: string;
  readonly displayName: string;
  readonly invalid?: boolean;
  readonly registerRef?: (el: HTMLInputElement | null) => void;
  readonly onSelect: (account: AccountVM) => void;
  readonly onClear: () => void;
  readonly onEnterEmpty?: () => void;
  readonly ariaLabel?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly emptyLabel?: string;
  readonly variant?: 'grouped' | 'compact';
  readonly allOptionLabel?: string;
  /** D5 display preferences; omit for a plain picker. */
  readonly preferences?: AccountPickerPreferences;
  /** Toggle a personal pin (display-only). Enables the ☆ affordance when set. */
  readonly onTogglePin?: (code: string, pinned: boolean) => void;
  /** localStorage key for per-device recents; falsy disables recent tracking. */
  readonly recentKey?: string;
}

function readRecents(key: string | undefined): readonly string[] {
  if (!key || typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string | undefined, code: string): void {
  if (!key || typeof window === 'undefined') return;
  const next = [code, ...readRecents(key).filter((c) => c !== code)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* storage full/blocked — recents are best-effort */
  }
}

export function AccountPicker({
  accounts,
  value,
  displayName,
  invalid = false,
  registerRef,
  onSelect,
  onClear,
  onEnterEmpty,
  ariaLabel = '选择科目',
  name = 'accountCode',
  placeholder = '编码或名称',
  emptyLabel = '无匹配科目',
  variant = 'grouped',
  allOptionLabel,
  preferences,
  onTogglePin,
  recentKey,
}: AccountPickerProps) {
  const reactId = useId();
  const inputId = `${reactId}-input`;
  const pickerId = `${reactId}-picker`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const [browseCategory, setBrowseCategory] = useState<AccountCategory>('asset');
  const [browsePrimary, setBrowsePrimary] = useState<string | null>(null);
  const [recents, setRecents] = useState<readonly string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const hiddenSet = useMemo(() => new Set(preferences?.hidden ?? []), [preferences?.hidden]);
  const pinnedSet = useMemo(() => new Set(preferences?.pinned ?? []), [preferences?.pinned]);
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const selectable = useMemo(() => accounts.filter((a) => a.isLeaf && a.active), [accounts]);

  const normalizedQuery = query.trim().toLowerCase();
  // Search covers ALL valid leaves — hidden-by-preference accounts stay findable (D5).
  const filteredAccounts = useMemo(() => {
    if (normalizedQuery === '') return selectable;
    return selectable.filter(
      (a) =>
        a.code.toLowerCase().includes(normalizedQuery) ||
        a.name.toLowerCase().includes(normalizedQuery),
    );
  }, [selectable, normalizedQuery]);
  const grouped = useMemo(
    () =>
      ACCOUNT_CATEGORIES.map((c) => ({
        ...c,
        accounts: filteredAccounts.filter((a) => a.category === c.value),
      })).filter((g) => g.accounts.length > 0),
    [filteredAccounts],
  );

  // 常用 chips: pinned → team recommended → device recents (deduped, selectable only).
  const commonAccounts = useMemo(() => {
    const ordered = [...(preferences?.pinned ?? []), ...(preferences?.recommended ?? []), ...recents];
    const seen = new Set<string>();
    const out: AccountVM[] = [];
    for (const code of ordered) {
      if (seen.has(code)) continue;
      seen.add(code);
      const account = byCode.get(code);
      if (account && account.isLeaf && account.active) out.push(account);
      if (out.length >= COMMON_LIMIT) break;
    }
    return out;
  }, [preferences?.pinned, preferences?.recommended, recents, byCode]);

  const browsePrimaries = useMemo(
    () =>
      accounts.filter(
        (a) => a.category === browseCategory && a.level === 1 && a.active && !hiddenSet.has(a.code),
      ),
    [accounts, browseCategory, hiddenSet],
  );
  const activePrimary = browsePrimary ? (byCode.get(browsePrimary) ?? null) : null;
  const browseChildren = useMemo(() => {
    if (!activePrimary) return [];
    return selectable.filter(
      (a) =>
        a.code !== activePrimary.code &&
        a.code.startsWith(activePrimary.code) &&
        !hiddenSet.has(a.code),
    );
  }, [selectable, activePrimary, hiddenSet]);
  const hiddenCount = useMemo(
    () =>
      selectable.filter((a) => a.category === browseCategory && hiddenSet.has(a.code)).length,
    [selectable, browseCategory, hiddenSet],
  );

  const browsing = variant === 'grouped' && normalizedQuery === '';
  // Keyboard list: search results when searching; 常用 + the active category's
  // visible leaves when browsing (mouse drives the drill-down columns).
  const flatAccounts = useMemo(() => {
    if (variant === 'compact') return filteredAccounts;
    if (!browsing) return grouped.flatMap((g) => g.accounts);
    const categoryLeaves = selectable.filter(
      (a) => a.category === browseCategory && !hiddenSet.has(a.code),
    );
    const seen = new Set(commonAccounts.map((a) => a.code));
    return [...commonAccounts, ...categoryLeaves.filter((a) => !seen.has(a.code))];
  }, [variant, filteredAccounts, browsing, grouped, selectable, browseCategory, hiddenSet, commonAccounts]);

  const showAllOption = variant === 'compact' && Boolean(allOptionLabel);
  const optionCount = flatAccounts.length + (showAllOption ? 1 : 0);
  const selectedText = value
    ? `${value} ${displayName}`
    : showAllOption
      ? (allOptionLabel ?? '')
      : '';
  const text = editing ? query : selectedText;

  function setInputRef(el: HTMLInputElement | null): void {
    inputRef.current = el;
    registerRef?.(el);
  }

  function computePosition(): void {
    const anchor = inputRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const pickerWidth = variant === 'compact' ? PICKER_COMPACT_WIDTH : PICKER_WIDTH;
    const pickerHeight = variant === 'compact' ? PICKER_COMPACT_HEIGHT : PICKER_HEIGHT;
    const width = Math.min(pickerWidth, viewportWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      viewportWidth - width - VIEWPORT_MARGIN,
    );
    const maxHeight = Math.min(pickerHeight, viewportHeight - VIEWPORT_MARGIN * 2);
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
      const pickerHeight = variant === 'compact' ? PICKER_COMPACT_HEIGHT : PICKER_HEIGHT;
      setPlacement(below >= pickerHeight || below >= above ? 'bottom' : 'top');
    }
    setRecents(readRecents(recentKey));
    const selected = value ? byCode.get(value) : undefined;
    if (selected) {
      setBrowseCategory(selected.category);
      setBrowsePrimary(selected.level > 1 ? selected.code.slice(0, 4) : selected.code);
    }
    const selectedIndex = flatAccounts.findIndex((a) => a.code === value);
    const offset = showAllOption ? 1 : 0;
    setActive(selectedIndex >= 0 ? selectedIndex + offset : 0);
    setOpen(true);
  }

  function choose(account: AccountVM): void {
    pushRecent(recentKey, account.code);
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

  function chooseAll(): void {
    clearSelection();
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
      else setActive((i) => Math.min(i + 1, Math.max(optionCount - 1, 0)));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && showAllOption && active === 0) chooseAll();
      else if (open && flatAccounts[active - (showAllOption ? 1 : 0)]) {
        choose(flatAccounts[active - (showAllOption ? 1 : 0)]);
      } else if (open) onEnterEmpty?.();
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
  }, [open, placement, normalizedQuery, flatAccounts.length, grouped.length, browsePrimary]);

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
      setActive((i) => Math.min(i + 1, Math.max(optionCount - 1, 0)));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && showAllOption && active === 0) {
      e.preventDefault();
      chooseAll();
    } else if (e.key === 'Enter' && flatAccounts[active - (showAllOption ? 1 : 0)]) {
      e.preventDefault();
      choose(flatAccounts[active - (showAllOption ? 1 : 0)]);
    }
  }

  function pinToggle(account: AccountVM): React.ReactNode {
    if (!onTogglePin) return null;
    const pinned = pinnedSet.has(account.code);
    return (
      <span
        role="button"
        tabIndex={-1}
        className={`${styles.pinBtn}${pinned ? ` ${styles.pinBtnOn}` : ''}`}
        aria-label={pinned ? `取消收藏 ${account.code}` : `收藏 ${account.code}`}
        title={pinned ? '取消收藏' : '收藏为常用'}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(account.code, !pinned);
        }}
      >
        {pinned ? '★' : '☆'}
      </span>
    );
  }

  function leafOption(a: AccountVM, extraClass = ''): React.ReactNode {
    const flatIndex = flatAccounts.findIndex((item) => item.code === a.code);
    const optionIndex = flatIndex + (showAllOption ? 1 : 0);
    return (
      <button
        key={a.id}
        type="button"
        role="option"
        aria-selected={flatIndex >= 0 && optionIndex === active}
        className={`${styles.option}${extraClass ? ` ${extraClass}` : ''}${
          flatIndex >= 0 && optionIndex === active ? ` ${styles.optionActive}` : ''
        }`}
        onClick={() => choose(a)}
        onMouseEnter={() => (flatIndex >= 0 ? setActive(optionIndex) : undefined)}
      >
        <span className={styles.optionCode}>{a.code}</span>
        <span className={styles.optionName}>{a.name}</span>
        {normalizedQuery !== '' && hiddenSet.has(a.code) ? (
          <span className={styles.hiddenTag}>已隐藏</span>
        ) : null}
        {pinToggle(a)}
      </button>
    );
  }

  const browseBody = (
    <div className={styles.browse}>
      {commonAccounts.length > 0 ? (
        <div className={styles.chipsRow} role="group" aria-label="常用科目">
          {commonAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${styles.chip}${pinnedSet.has(a.code) ? ` ${styles.chipPinned}` : ''}`}
              onClick={() => choose(a)}
              title={`${a.code} ${a.name}`}
            >
              <span className={styles.optionCode}>{a.code}</span>
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.columns}>
        <div className={styles.colCats} role="tablist" aria-label="科目分类">
          {ACCOUNT_CATEGORIES.filter((c) => accounts.some((a) => a.category === c.value)).map(
            (c) => (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={browseCategory === c.value}
                className={`${styles.catBtn}${browseCategory === c.value ? ` ${styles.catBtnActive}` : ''}`}
                onClick={() => {
                  setBrowseCategory(c.value);
                  setBrowsePrimary(null);
                }}
              >
                {c.label}
              </button>
            ),
          )}
        </div>
        <div className={styles.colPrimary} role="listbox" aria-label="主科目">
          {browsePrimaries.length === 0 ? <div className={styles.empty}>{emptyLabel}</div> : null}
          {browsePrimaries.map((p) =>
            p.isLeaf ? (
              leafOption(p)
            ) : (
              <button
                key={p.id}
                type="button"
                className={`${styles.option} ${styles.branchOption}${
                  browsePrimary === p.code ? ` ${styles.branchOptionActive}` : ''
                }`}
                aria-expanded={browsePrimary === p.code}
                onClick={() => setBrowsePrimary(browsePrimary === p.code ? null : p.code)}
              >
                <span className={styles.optionCode}>{p.code}</span>
                <span className={styles.optionName}>{p.name}</span>
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </button>
            ),
          )}
          {hiddenCount > 0 ? (
            <div className={styles.hiddenNote}>已少展示 {hiddenCount} 项（搜索仍可选）</div>
          ) : null}
        </div>
        <div className={styles.colDetail} role="listbox" aria-label="明细科目">
          {activePrimary && !activePrimary.isLeaf ? (
            browseChildren.length > 0 ? (
              browseChildren.map((a) => leafOption(a))
            ) : (
              <div className={styles.empty}>该科目暂无可选明细</div>
            )
          ) : (
            <div className={styles.detailHint}>选择左侧带 › 的科目查看明细</div>
          )}
        </div>
      </div>
    </div>
  );

  const searchBody = (
    <div className={styles.sections} role="listbox" aria-label="科目">
      {grouped.length === 0 ? <div className={styles.empty}>{emptyLabel}</div> : null}
      {grouped.map((g) => (
        <section key={g.value} className={styles.section}>
          <h3 className={styles.sectionTitle}>{g.label}</h3>
          <div className={styles.options}>{g.accounts.map((a) => leafOption(a))}</div>
        </section>
      ))}
    </div>
  );

  return (
    <div className={styles.root}>
      <input
        id={inputId}
        name={name}
        ref={setInputRef}
        className={`mt-input ${styles.input}${invalid ? ` mt-input--error ${styles.requiredInput}` : ''}`}
        value={text}
        placeholder={invalid ? '请选择科目' : placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
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
              id={pickerId}
              ref={popoverRef}
              className={`${styles.picker}${variant === 'compact' ? ` ${styles.pickerCompact}` : ''}`}
              style={
                popoverStyle ?? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: variant === 'compact' ? PICKER_COMPACT_WIDTH : PICKER_WIDTH,
                  maxHeight: variant === 'compact' ? PICKER_COMPACT_HEIGHT : PICKER_HEIGHT,
                  visibility: 'hidden',
                }
              }
              role="dialog"
              aria-label={ariaLabel}
              onKeyDown={onPopoverKeyDown}
            >
              {variant === 'compact' ? (
                <div className={styles.compactOptions} role="listbox" aria-label="科目">
                  {showAllOption ? (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active === 0}
                      className={`${styles.option} ${styles.compactOption}${
                        active === 0 ? ` ${styles.optionActive}` : ''
                      }`}
                      onClick={chooseAll}
                      onMouseEnter={() => setActive(0)}
                    >
                      <span>{allOptionLabel}</span>
                    </button>
                  ) : null}
                  {flatAccounts.length === 0 && !showAllOption ? (
                    <div className={styles.empty}>{emptyLabel}</div>
                  ) : null}
                  {flatAccounts.map((a, flatIndex) => {
                    const optionIndex = flatIndex + (showAllOption ? 1 : 0);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={optionIndex === active}
                        className={`${styles.option} ${styles.compactOption}${
                          optionIndex === active ? ` ${styles.optionActive}` : ''
                        }`}
                        onClick={() => choose(a)}
                        onMouseEnter={() => setActive(optionIndex)}
                      >
                        <span className={styles.optionCode}>{a.code}</span>
                        <span>{a.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : browsing ? (
                browseBody
              ) : (
                searchBody
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
