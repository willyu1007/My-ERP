/**
 * T-004 posting templates (记账模板) — map a captured document's extracted fields
 * to a voucher DRAFT skeleton. Finance-owned and code-first (this is NOT the
 * configurable PostingRule engine; that is M2). It produces a draft only; it
 * never posts. Lines the template cannot infer (the contra side) come back with
 * no `accountCode` for a human to fill in the fast-entry grid.
 *
 * `PostingExtraction` is the flattened (value-only) form of the contracts
 * `ExtractionResult`; keep the two aligned. Kept dependency-free so this stays a
 * pure-domain module.
 */
export type DocType = 'bank_slip' | 'invoice' | 'receipt' | 'unknown';

export interface PostingExtraction {
  docType: DocType;
  direction?: 'in' | 'out';
  amount?: string;
  date?: string;
  summary?: string;
  docNo?: string;
  counterparty?: string;
}

export interface DraftVoucherLine {
  /** Unset when the template cannot infer the account — the human fills it in. */
  accountCode?: string;
  summary: string;
  debit?: string;
  credit?: string;
}

export interface DraftVoucher {
  date?: string;
  summary: string;
  lines: DraftVoucherLine[];
}

export interface PostingTemplate {
  key: string;
  version: string;
  match: (x: PostingExtraction) => boolean;
  build: (x: PostingExtraction) => DraftVoucher;
}

/** 银行存款 — the one account the bank-slip template can infer with confidence. */
const BANK_ACCOUNT = '1002';

const bankSlip: PostingTemplate = {
  key: 'bank-slip',
  version: 'v1',
  match: (x) => x.docType === 'bank_slip' && x.amount != null && x.amount !== '',
  build: (x) => {
    const amount = x.amount ?? '';
    const inflow = x.direction !== 'out'; // default to a receipt
    const summary = x.summary ?? (inflow ? '银行收款' : '银行付款');
    const bankLine: DraftVoucherLine = inflow
      ? { accountCode: BANK_ACCOUNT, summary, debit: amount }
      : { accountCode: BANK_ACCOUNT, summary, credit: amount };
    const contraLine: DraftVoucherLine = inflow
      ? { summary, credit: amount }
      : { summary, debit: amount };
    return { date: x.date, summary, lines: [bankLine, contraLine] };
  },
};

export const FINANCE_POSTING_TEMPLATES: readonly PostingTemplate[] = [bankSlip];

export function selectPostingTemplate(x: PostingExtraction): PostingTemplate | null {
  return FINANCE_POSTING_TEMPLATES.find((t) => t.match(x)) ?? null;
}

export interface BuiltDraft {
  templateKey: string;
  draft: DraftVoucher;
  /** True when every line has an account code (ready for the balance check). */
  complete: boolean;
}

/**
 * Build a voucher draft from extracted fields. Returns null when no template
 * matches (the caller falls back to a blank, attachment-linked draft). `complete`
 * is false when any line still needs a human-chosen account (→ pending_completion).
 */
export function buildDraftFromExtraction(x: PostingExtraction): BuiltDraft | null {
  const template = selectPostingTemplate(x);
  if (!template) return null;
  const draft = template.build(x);
  const complete =
    draft.lines.length >= 2 &&
    draft.lines.every((l) => l.accountCode != null && l.accountCode !== '');
  return { templateKey: template.key, draft, complete };
}
