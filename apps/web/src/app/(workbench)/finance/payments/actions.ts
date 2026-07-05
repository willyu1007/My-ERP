'use server';

import { classifyActionFailure } from '@/lib/finance/action-failure';

/**
 * Server actions for 出纳收付款 (T-007 C3). Each runs against the real `/v1`; the
 * backend re-checks SoD + status + optimistic version, so a 403/409 surfaces as
 * "已变化，请刷新". Create returns the new id so the client can route to the detail.
 */
import type { CreatePayment, EnrichPayment } from '@my-erp/api-client';
import {
  approvePayment,
  confirmPayment,
  createPayment,
  enrichPayment,
  submitPayment,
  voidPayment,
} from '@/lib/finance/data-source';

export type PaymentActionResult =
  | { readonly ok: true; readonly id?: string; readonly no?: string; readonly postedNo?: string }
  | {
      readonly ok: false;
      readonly reason: 'unconfigured' | 'conflict' | 'error';
      readonly message: string;
    };

function toFailure(err: unknown): PaymentActionResult {
  return { ok: false, ...classifyActionFailure(err) };
}

export async function createPaymentAction(input: CreatePayment): Promise<PaymentActionResult> {
  try {
    const p = await createPayment(input);
    return { ok: true, id: p.id, no: p.no };
  } catch (err) {
    return toFailure(err);
  }
}

export async function createAndSubmitPaymentAction(
  input: CreatePayment,
): Promise<PaymentActionResult> {
  try {
    const created = await createPayment(input);
    const submitted = await submitPayment(created.id, created.version);
    return { ok: true, id: submitted.id, no: submitted.no };
  } catch (err) {
    return toFailure(err);
  }
}

/** Accountant enrichment: complete accounting facts on a 待补录 doc (T-012 Phase 3). */
export async function enrichPaymentAction(
  id: string,
  input: EnrichPayment,
): Promise<PaymentActionResult> {
  try {
    const p = await enrichPayment(id, input);
    return { ok: true, id: p.id, no: p.no };
  } catch (err) {
    return toFailure(err);
  }
}

export async function submitPaymentAction(
  id: string,
  expectedVersion: number,
): Promise<PaymentActionResult> {
  try {
    const p = await submitPayment(id, expectedVersion);
    return { ok: true, no: p.no };
  } catch (err) {
    return toFailure(err);
  }
}

export async function approvePaymentAction(
  id: string,
  expectedVersion: number,
): Promise<PaymentActionResult> {
  try {
    const p = await approvePayment(id, expectedVersion);
    return { ok: true, no: p.no };
  } catch (err) {
    return toFailure(err);
  }
}

export async function confirmPaymentAction(
  id: string,
  expectedVersion: number,
): Promise<PaymentActionResult> {
  try {
    const r = await confirmPayment(id, expectedVersion, true);
    return { ok: true, no: r.no, postedNo: r.settlementVoucher?.no };
  } catch (err) {
    return toFailure(err);
  }
}

export async function voidPaymentAction(
  id: string,
  expectedVersion: number,
  reason?: string,
): Promise<PaymentActionResult> {
  try {
    const p = await voidPayment(id, expectedVersion, reason);
    return { ok: true, no: p.no };
  } catch (err) {
    return toFailure(err);
  }
}
