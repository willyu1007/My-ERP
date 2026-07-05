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
import type { BusinessPartner } from '@my-erp/api-client';
import { PARTNER_PARTY_TYPE, partnerRolesLabel } from '@/lib/finance/partner-display';
import styles from './partner-picker.module.css';

const PICKER_GAP = 6;
const PICKER_WIDTH = 280;
const PICKER_HEIGHT = 300;
const VIEWPORT_MARGIN = 12;

export interface PartnerPickerProps {
  readonly partners: readonly BusinessPartner[];
  /** Selected partner id ('' = none — the free text is the counterparty). */
  readonly partnerId: string;
  /** Free-text counterparty shown when no partner is selected (legacy compat). */
  readonly text: string;
  readonly onSelect: (partner: BusinessPartner) => void;
  /** Free-text edits — the parent clears partnerId when this fires. */
  readonly onTextChange: (text: string) => void;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
  readonly name?: string;
}

function matchesPartner(partner: BusinessPartner, query: string): boolean {
  const haystack = [partner.name, partner.wechat, ...partner.tags, partnerRolesLabel(partner.roles)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * 付款/收款对象 picker (T-012): choose a BusinessPartner master record or keep
 * plain typed text (legacy counterparty compat). Selecting fills the snapshot
 * from the master; typing detaches the link. ERP-owned suggestions only —
 * native autocomplete is suppressed.
 */
export function PartnerPicker({
  partners,
  partnerId,
  text,
  onSelect,
  onTextChange,
  ariaLabel = '付款/收款对象',
  placeholder = '搜索或输入对方单位 / 个人',
  name = 'partnerId',
}: PartnerPickerProps) {
  const reactId = useId();
  const pickerId = `${reactId}-picker`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const selected = partners.find((p) => p.id === partnerId) ?? null;
  const displayed = selected ? selected.name : text;
  const normalizedQuery = selected ? '' : text.trim().toLowerCase();
  const options = useMemo(() => {
    if (normalizedQuery === '') return partners;
    return partners.filter((p) => matchesPartner(p, normalizedQuery));
  }, [partners, normalizedQuery]);

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
    const selectedIndex = options.findIndex((option) => option.id === partnerId);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(partner: BusinessPartner): void {
    onSelect(partner);
    setOpen(false);
  }

  function updateText(next: string): void {
    onTextChange(next);
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (selected && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      updateText(e.key);
    } else if (selected && e.key === 'Backspace') {
      e.preventDefault();
      updateText('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openPicker();
      else setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && options[active] !== undefined) choose(options[active]);
      else setOpen(false);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
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
        name={name}
        ref={inputRef}
        className={`mt-input ${styles.input}`}
        value={displayed}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        aria-haspopup="dialog"
        onChange={(e) => {
          const nextValue = e.target.value;
          if (selected && nextValue.startsWith(selected.name)) {
            updateText(nextValue.slice(selected.name.length));
          } else {
            updateText(nextValue);
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
              <div className={styles.options} role="listbox" aria-label="往来单位">
                {options.length === 0 ? (
                  <div className={styles.empty}>
                    {text.trim() === ''
                      ? '暂无往来单位'
                      : `无匹配 — 将以自由文本「${text.trim()}」记录`}
                  </div>
                ) : null}
                {options.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`${styles.option}${index === active ? ` ${styles.optionActive}` : ''}`}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className={styles.optionMain}>
                      <span className={styles.optionTitle}>
                        <span className={styles.title}>{option.name}</span>
                      </span>
                      <span className={styles.meta}>
                        {partnerRolesLabel(option.roles)}
                        {option.wechat ? ` · 微信 ${option.wechat}` : ''}
                      </span>
                    </span>
                    <span className={styles.status}>
                      {PARTNER_PARTY_TYPE[option.partyType] ?? option.partyType}
                    </span>
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
