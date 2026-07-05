'use server';

import { classifyActionFailure } from '@/lib/finance/action-failure';

/**
 * Server actions for 我的工作台 (T-009, restoring T-003 R2-UI) against the `/v1`
 * work-item kernel. The backend recomputes visibility/actionability, re-checks SoD
 * + source state + optimistic version, so a 403/409 surfaces as "任务已变化，请刷新".
 * `complete` posts the source voucher transactionally and returns its number.
 */
import { actOnWorkItem } from '@/lib/finance/data-source';

export type TaskActionResult =
  | { readonly ok: true; readonly status: string; readonly postedNo?: string }
  | {
      readonly ok: false;
      readonly reason: 'unconfigured' | 'conflict' | 'error';
      readonly message: string;
    };

function toFailure(err: unknown): TaskActionResult {
  return { ok: false, ...classifyActionFailure(err) };
}

export async function claimTaskAction(
  id: string,
  expectedVersion: number,
): Promise<TaskActionResult> {
  try {
    const r = await actOnWorkItem(id, 'claim', { expectedVersion });
    return { ok: true, status: r.workItem.status };
  } catch (err) {
    return toFailure(err);
  }
}

export async function completeTaskAction(
  id: string,
  expectedVersion: number,
): Promise<TaskActionResult> {
  try {
    const r = await actOnWorkItem(id, 'complete', { expectedVersion });
    return { ok: true, status: r.workItem.status, postedNo: r.source?.no };
  } catch (err) {
    return toFailure(err);
  }
}

export async function cancelTaskAction(
  id: string,
  expectedVersion: number,
): Promise<TaskActionResult> {
  try {
    const r = await actOnWorkItem(id, 'cancel', { expectedVersion });
    return { ok: true, status: r.workItem.status };
  } catch (err) {
    return toFailure(err);
  }
}
