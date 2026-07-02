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
const PICKER_HEIGHT = 360;
const PICKER_COMPACT_WIDTH = 320;
const PICKER_COMPACT_HEIGHT = 260;
const VIEWPORT_MARGIN = 12;

export interface AccountPickerProps {
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
  const flatAccounts = useMemo(
    () => (variant === 'compact' ? filteredAccounts : grouped.flatMap((g) => g.accounts)),
    [filteredAccounts, grouped, variant],
  );

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
    const selectedIndex = flatAccounts.findIndex((a) => a.code === value);
    const offset = showAllOption ? 1 : 0;
    setActive(selectedIndex >= 0 ? selectedIndex + offset : 0);
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

  return (
    <div className={styles.root}>
      <input
        id={inputId}
        name={name}
        ref={setInputRef}
        className={`mt-input ${styles.input}${invalid ? ` mt-input--error ${styles.requiredInput}` : ''}`}
        value={text}
        placeholder={invalid ? '请选择科目' : placeholder}
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
              ) : (
                <div className={styles.sections} role="listbox" aria-label="科目">
                  {grouped.length === 0 ? <div className={styles.empty}>{emptyLabel}</div> : null}
                  {grouped.map((g) => (
                    <section key={g.value} className={styles.section}>
                      <h3 className={styles.sectionTitle}>{g.label}</h3>
                      <div className={styles.options}>
                        {g.accounts.map((a) => {
                          const flatIndex = flatAccounts.findIndex((item) => item.id === a.id);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              role="option"
                              aria-selected={flatIndex === active}
                              className={`${styles.option}${
                                flatIndex === active ? ` ${styles.optionActive}` : ''
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
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
