/**
 * Contract timeline (合同时间线, T-005) — a pure read model that merges a contract's
 * authoritative documents (linked vouchers + payments) and the contract-created
 * event into one time-ordered list. It is a *view* over document state, never a
 * second copy of business state. No DB / no float.
 */
export interface TimelineDocRef {
  readonly id: string;
  readonly no: string;
  /** YYYY-MM-DD */
  readonly date: string;
  readonly summary: string;
  readonly status: string;
  readonly amount: string | null;
}

export interface ContractTimelineInput {
  readonly contract: { readonly code: string; readonly createdAt: string; readonly title: string };
  readonly vouchers: readonly TimelineDocRef[];
  readonly payments: readonly (TimelineDocRef & { readonly direction: string })[];
}

export type TimelineKind = 'contract' | 'voucher' | 'payment';

export interface TimelineItem {
  readonly kind: TimelineKind;
  /** YYYY-MM-DD used for ordering + display. */
  readonly date: string;
  readonly title: string;
  readonly summary: string;
  readonly amount: string | null;
  readonly status: string | null;
  readonly refType: 'Contract' | 'JournalVoucher' | 'PaymentDoc';
  readonly refId: string;
}

const KIND_ORDER: Record<TimelineKind, number> = { contract: 0, voucher: 1, payment: 2 };

/** Merge the contract event + linked vouchers + payments into one ascending timeline. */
export function buildContractTimeline(input: ContractTimelineInput): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      kind: 'contract',
      date: input.contract.createdAt.slice(0, 10),
      title: `合同建立 ${input.contract.code}`,
      summary: input.contract.title,
      amount: null,
      status: null,
      refType: 'Contract',
      refId: input.contract.code,
    },
    ...input.vouchers.map(
      (v): TimelineItem => ({
        kind: 'voucher',
        date: v.date,
        title: `凭证 ${v.no}`,
        summary: v.summary,
        amount: v.amount,
        status: v.status,
        refType: 'JournalVoucher',
        refId: v.id,
      }),
    ),
    ...input.payments.map(
      (p): TimelineItem => ({
        kind: 'payment',
        date: p.date,
        title: `${p.direction === 'receipt' ? '收款' : '付款'} ${p.no}`,
        summary: p.summary,
        amount: p.amount,
        status: p.status,
        refType: 'PaymentDoc',
        refId: p.id,
      }),
    ),
  ];

  // The contract-created event anchors the top (its genesis); documents follow in
  // ascending date order. (A doc may be back-dated before the contract was entered,
  // so a plain chronological sort would bury the anchor.)
  const anchor = (i: TimelineItem): number => (i.kind === 'contract' ? 0 : 1);
  return items.sort(
    (a, b) =>
      anchor(a) - anchor(b) ||
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title),
  );
}
