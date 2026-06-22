/**
 * Work-item source resolution — the single place that maps a kernel WorkItem to
 * its safe source summary + deep link (sourceType-aware: voucher / payment). Both
 * the 我的工作台 queue and the home 看板 attention consume this, so the deep-link
 * rule and ref shape live in one spot (no per-page drift). Pure (no React).
 */
import type { PaymentDoc, WorkItem } from '@my-erp/api-client';
import type { VoucherVM } from './types';

export interface WorkItemSourceRef {
  readonly no: string;
  readonly summary: string;
  readonly amount: string;
  readonly date: string;
}

/** Deep link to a work item's source entity (sourceType-aware). */
export function workItemDeepLink(sourceType: string, sourceId: string): string {
  return sourceType === 'PaymentDoc'
    ? `/finance/payments/${sourceId}`
    : `/finance/vouchers/${sourceId}`;
}

/** Resolve a display-safe source summary from preloaded voucher/payment maps. */
export function resolveWorkItemRef(
  item: WorkItem,
  vouchers: ReadonlyMap<string, VoucherVM>,
  payments: ReadonlyMap<string, PaymentDoc>,
): WorkItemSourceRef | null {
  if (item.sourceType === 'PaymentDoc') {
    const p = payments.get(item.sourceId);
    return p ? { no: p.no, summary: p.summary, amount: p.amount, date: p.date } : null;
  }
  const v = vouchers.get(item.sourceId);
  return v ? { no: v.no, summary: v.summary, amount: v.totalDebit, date: v.date } : null;
}
