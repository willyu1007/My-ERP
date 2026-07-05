'use client';

/**
 * Shared popover mechanics for the finance pickers (account/partner/contract):
 * fixed-position placement with viewport clamping and top/bottom flip, plus
 * outside-click / resize / scroll handling. Extracted so the three pickers
 * cannot drift (they previously carried three copies of this logic).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';

const DEFAULT_GAP = 6;
const DEFAULT_MARGIN = 12;

export interface PickerPopoverOptions {
  readonly width: number;
  readonly height: number;
  readonly gap?: number;
  readonly margin?: number;
}

export function usePickerPopover({
  width,
  height,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
}: PickerPopoverOptions) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  function computePosition(): void {
    const anchor = inputRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clampedWidth = Math.min(width, viewportWidth - margin * 2);
    const left = Math.min(Math.max(rect.left, margin), viewportWidth - clampedWidth - margin);
    const maxHeight = Math.min(height, viewportHeight - margin * 2);
    const measuredHeight = popoverRef.current?.getBoundingClientRect().height ?? maxHeight;
    const panelHeight = Math.min(maxHeight, Math.max(1, measuredHeight));
    const preferredTop = placement === 'bottom' ? rect.bottom + gap : rect.top - panelHeight - gap;
    const top = Math.min(Math.max(preferredTop, margin), viewportHeight - panelHeight - margin);
    setPopoverStyle({ position: 'fixed', left, top, width: clampedWidth, maxHeight });
  }

  /** Pick top/bottom placement from the anchor's viewport position, then open. */
  function openPopover(): void {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      setPlacement(below >= height || below >= above ? 'bottom' : 'top');
    }
    setOpen(true);
  }

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

  /** Style for the first paint before computePosition has measured the panel. */
  const fallbackStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width,
    maxHeight: height,
    visibility: 'hidden',
  };

  return {
    open,
    setOpen,
    placement,
    popoverStyle,
    inputRef,
    popoverRef,
    computePosition,
    openPopover,
    fallbackStyle,
  };
}
