'use server';

import { classifyActionFailure } from '@/lib/finance/action-failure';

/** Server actions for 合同 (T-005 C3). create returns the new id for routing. */
import type { CreateContract } from '@my-erp/api-client';
import { createContract, updateContract } from '@/lib/finance/data-source';

export type ContractActionResult =
  | { readonly ok: true; readonly id?: string; readonly code?: string }
  | {
      readonly ok: false;
      readonly reason: 'unconfigured' | 'conflict' | 'error';
      readonly message: string;
    };

function toFailure(err: unknown): ContractActionResult {
  return { ok: false, ...classifyActionFailure(err) };
}

export async function createContractAction(input: CreateContract): Promise<ContractActionResult> {
  try {
    const c = await createContract(input);
    return { ok: true, id: c.id, code: c.code };
  } catch (err) {
    return toFailure(err);
  }
}

export async function setContractStatusAction(
  id: string,
  expectedVersion: number,
  status: 'draft' | 'active' | 'closed',
): Promise<ContractActionResult> {
  try {
    const c = await updateContract(id, { expectedVersion, status });
    return { ok: true, code: c.code };
  } catch (err) {
    return toFailure(err);
  }
}
