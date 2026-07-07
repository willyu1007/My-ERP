/**
 * Display vocabulary for 资金执行 (FundConsumption, T-012 Phase 4 / T-013 queue).
 * Pure maps shared by the 出纳收付 queue section and the voucher-detail panel —
 * cashier-facing copy stays business wording (收款/付款, 确认到账/确认已付), never
 * accounting jargon (流入/流出, 过账).
 */
import type { CardTone } from '@my-erp/ui/contracts';

/** direction → cashier label. */
export const FUND_DIRECTION_LABEL: Record<string, string> = {
  inflow: '收款',
  outflow: '付款',
};

/** direction → the confirm verb (money arrived vs money paid out). */
export const FUND_CONFIRM_LABEL: Record<string, string> = {
  inflow: '确认到账',
  outflow: '确认已付',
};

export const FUND_EXECUTION_LABEL: Record<string, string> = {
  pending: '待执行',
  executed: '已执行',
  skipped: '无需执行',
  void: '已作废',
};

export const FUND_EXECUTION_TONE: Record<string, CardTone> = {
  pending: 'warning',
  executed: 'success',
  skipped: 'muted',
  void: 'muted',
};

/**
 * Server fetch cap for the 资金执行 queue (the section shows a hint at the cap).
 * Lives here (NOT in the 'use client' queue module) so the server page can import
 * it — client-module exports are poisoned for server components.
 */
export const FUND_QUEUE_FETCH_LIMIT = 100;
