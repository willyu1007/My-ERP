'use server';

import { classifyActionFailure } from '@/lib/finance/action-failure';

/** Server actions for 往来单位 (T-012 Phase 1). */
import type { CreateBusinessPartner, UpdateBusinessPartner } from '@my-erp/api-client';
import { createBusinessPartner, updateBusinessPartner } from '@/lib/finance/data-source';

export type PartnerActionResult =
  | { readonly ok: true; readonly id?: string; readonly name?: string }
  | {
      readonly ok: false;
      readonly reason: 'unconfigured' | 'conflict' | 'error';
      readonly message: string;
    };

function toFailure(err: unknown): PartnerActionResult {
  return { ok: false, ...classifyActionFailure(err) };
}

export async function createBusinessPartnerAction(
  input: CreateBusinessPartner,
): Promise<PartnerActionResult> {
  try {
    const partner = await createBusinessPartner(input);
    return { ok: true, id: partner.id, name: partner.name };
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateBusinessPartnerAction(
  id: string,
  input: UpdateBusinessPartner,
): Promise<PartnerActionResult> {
  try {
    const partner = await updateBusinessPartner(id, input);
    return { ok: true, id: partner.id, name: partner.name };
  } catch (err) {
    return toFailure(err);
  }
}
