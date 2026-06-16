'use server';

/**
 * Server actions for the inline voucher fast-entry grid (T-004 S1c). They run
 * the data-source create/submit against the real `/v1` API; when the backend is
 * not configured they return `unconfigured` so the client can show a demo toast
 * (the grid still works on the fixture-backed read path).
 */
import type { CaptureIntake, CreateVoucher } from '@my-erp/api-client';
import {
  captureIntake,
  createVoucher,
  extractIntake,
  submitVoucher,
  updateVoucher,
} from '@/lib/finance/data-source';

export type ActionFailure = {
  readonly ok: false;
  readonly reason: 'unconfigured' | 'error';
  readonly message: string;
};

export type SaveResult =
  | { readonly ok: true; readonly id: string; readonly no: string; readonly submitted: boolean }
  | ActionFailure;

function toFailure(err: unknown): ActionFailure {
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

/** Update an existing draft (stays draft). */
export async function updateDraftAction(id: string, input: CreateVoucher): Promise<SaveResult> {
  try {
    const v = await updateVoucher(id, input);
    return { ok: true, id: v.id, no: v.no, submitted: false };
  } catch (err) {
    return toFailure(err);
  }
}

/** Confirm a captured draft: update it, then submit (draft → pending). Completes the confirm task. */
export async function confirmAction(id: string, input: CreateVoucher): Promise<SaveResult> {
  try {
    await updateVoucher(id, input);
    const v = await submitVoucher(id);
    return { ok: true, id: v.id, no: v.no, submitted: true };
  } catch (err) {
    return toFailure(err);
  }
}

export type CaptureResult =
  | { readonly ok: true; readonly intakeId: string; readonly status: string; readonly voucherId: string | null }
  | ActionFailure;

/** Capture an attachment + run extraction (auto-drafts a voucher when high-confidence). */
export async function captureAction(input: CaptureIntake): Promise<CaptureResult> {
  try {
    const received = await captureIntake(input);
    const extracted = await extractIntake(received.id);
    return {
      ok: true,
      intakeId: extracted.id,
      status: extracted.status,
      voucherId: extracted.targetId ?? null,
    };
  } catch (err) {
    return toFailure(err);
  }
}
