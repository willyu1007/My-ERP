'use server';

/**
 * Server actions for the inline voucher fast-entry grid (T-004 S1c). They run
 * the data-source create/submit against the real `/v1` API; when the backend is
 * not configured they return `unconfigured` so the client can show a demo toast
 * (the grid still works on the fixture-backed read path).
 */
import type { CreateVoucher } from '@my-erp/api-client';
import { createVoucher, submitVoucher } from '@/lib/finance/data-source';

export type SaveResult =
  | { readonly ok: true; readonly id: string; readonly no: string; readonly submitted: boolean }
  | { readonly ok: false; readonly reason: 'unconfigured' | 'error'; readonly message: string };

function toFailure(err: unknown): SaveResult {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message.includes('not configured') ? 'unconfigured' : 'error';
  return { ok: false, reason, message };
}

/** Create a draft voucher (draft stays draft). */
export async function saveDraftAction(input: CreateVoucher): Promise<SaveResult> {
  try {
    const v = await createVoucher(input);
    return { ok: true, id: v.id, no: v.no, submitted: false };
  } catch (err) {
    return toFailure(err);
  }
}

/** Create a draft then submit it for review (draft → pending). */
export async function submitNewAction(input: CreateVoucher): Promise<SaveResult> {
  try {
    const draft = await createVoucher(input);
    const submitted = await submitVoucher(draft.id);
    return { ok: true, id: submitted.id, no: submitted.no, submitted: true };
  } catch (err) {
    return toFailure(err);
  }
}
