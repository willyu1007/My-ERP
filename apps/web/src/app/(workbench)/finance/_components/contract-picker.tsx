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
import type { Contract } from '@my-erp/api-client';
import { CONTRACT_STATUS } from '@/lib/finance/contract-display';
import styles from './contract-picker.module.css';

const PICKER_GAP = 6;
const PICKER_WIDTH = 280;
const PICKER_HEIGHT = 300;
const VIEWPORT_MARGIN = 12;

type ContractOption = Contract | null;

export interface ContractPickerProps {
  readonly contracts: readonly Contract[];
  readonly value: string;
  readonly onSelect: (contract: Contract) => void;
  readonly onClear: () => void;
  readonly ariaLabel?: string;
  readonly name?: string;
}

function matchesContract(contract: Contract, query: string): boolean {
  const haystack = [
    contract.code,
    contract.title,
    contract.counterparty,
    CONTRACT_STATUS[contract.status] ?? contract.status,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function optionKey(option: ContractOption): string {
  return option?.id ?? '__none__';
}

export function ContractPicker({
  contracts,
  value,
  onSelect,
  onClear,
  ariaLabel = '关联合同',
  name = 'contractId',
}: ContractPickerProps) {
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

  const selected = contracts.find((c) => c.id === value) ?? null;
  const selectedText = selected ? `${selected.code} ${selected.title}` : '';
  const text = editing ? query : selectedText;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredContracts = useMemo(() => {
    if (normalizedQuery === '') return contracts;
    return contracts.filter((c) => matchesContract(c, normalizedQuery));
  }, [contracts, normalizedQuery]);
  const showClearOption = normalizedQuery === '' || '不关联'.includes(normalizedQuery);
  const options = useMemo<readonly ContractOption[]>(
    () => (showClearOption ? [null, ...filteredContracts] : filteredContracts),
    [filteredContracts, showClearOption],
  );

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
    setPopoverStyle({ position: 'fixed', left, top, width, maxHeight });
  }

  function openPicker(): void {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
      const above = rect.top - VIEWPORT_MARGIN;
      setPlacement(below >= PICKER_HEIGHT || below >= above ? 'bottom' : 'top');
    }
    const selectedIndex = options.findIndex((option) => option?.id === value);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function restoreSelected(): void {
    setQuery('');
    setEditing(false);
  }

  function clear({ keepOpen = false }: { readonly keepOpen?: boolean } = {}): void {
    onClear();
    setQuery('');
    setEditing(false);
    setActive(0);
    setOpen(keepOpen);
  }

  function choose(option: ContractOption): void {
    if (option) onSelect(option);
    else onClear();
    setQuery('');
    setEditing(false);
    setOpen(false);
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
      clear({ keepOpen: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && options[active] !== undefined) choose(options[active]);
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
  }, [open, placement, normalizedQuery, options.length]);

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

  return (
    <div className={styles.root}>
      <input
        id={inputId}
        name={name}
        ref={inputRef}
        className={`mt-input ${styles.input}`}
        value={text}
        placeholder="搜索合同号 / 名称 / 对方"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        aria-haspopup="dialog"
        onChange={(e) => {
          const nextValue = e.target.value;
          if (selectedText && nextValue.trim() === '') {
            clear({ keepOpen: true });
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
              className={styles.picker}
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
              aria-label={ariaLabel}
            >
              <div className={styles.options} role="listbox" aria-label="合同">
                {options.length === 0 ? <div className={styles.empty}>无匹配合同</div> : null}
                {options.map((option, index) => (
                  <button
                    key={optionKey(option)}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`${styles.option}${option ? '' : ` ${styles.clearOption}`}${
                      index === active ? ` ${styles.optionActive}` : ''
                    }`}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActive(index)}
                  >
                    {option ? (
                      <>
                        <span className={styles.optionMain}>
                          <span className={styles.optionTitle}>
                            <span className={styles.code}>{option.code}</span>
                            <span className={styles.title}>{option.title}</span>
                          </span>
                          <span className={styles.meta}>{option.counterparty}</span>
                        </span>
                        <span className={styles.status}>
                          {CONTRACT_STATUS[option.status] ?? option.status}
                        </span>
                      </>
                    ) : (
                      <span className={styles.optionMain}>不关联</span>
                    )}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
