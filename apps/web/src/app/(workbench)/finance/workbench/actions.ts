'use server';

/**
 * Server actions for 我的工作台 (T-003 R2-UI). Each runs a backend-authorized
 * work-item action through the data-source; the backend re-checks permission and
 * optimistic version, so a stale `expectedVersion` returns a conflict the client
 * surfaces as "已变化，请刷新". The frontend never infers task permissions itself.
 */
import { actOnWorkItem } from '@/lib/finance/data-source';

export type TaskActionResult =
  | { readonly ok: true; readonly postedNo?: string }
  | { readonly ok: false; readonly reason: 'unconfigured' | 'conflict' | 'error'; readonly message: string };

function toFailure(err: unknown): TaskActionResult {
  const message = err instanceof Error ? err.message : String(err);
  // A button only renders for an available action, so a 403/409 means the task changed
  // under us (claimed/completed elsewhere, or version bumped) — surface as "refresh", not a hard error.
  const reason = message.includes('not configured')
    ? 'unconfigured'
    : /API (403|409)|no longer|conflict|stale/i.test(message)
      ? 'conflict'
      : 'error';
  return { ok: false, reason, message };
}

/** 领取 — assign the task to me (claim). */
export async function claimTaskAction(id: string, expectedVersion: number): Promise<TaskActionResult> {
  try {
    await actOnWorkItem(id, 'claim', { expectedVersion });
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

/** 通过并过账 — complete a voucher.review task (posts the voucher in one tx). */
export async function completeTaskAction(
  id: string,
  expectedVersion: number,
): Promise<TaskActionResult> {
  try {
    const res = await actOnWorkItem(id, 'complete', { expectedVersion, confirmSinglePerson: true });
    const source = res.source as { no?: string } | undefined;
    return { ok: true, postedNo: source?.no };
  } catch (err) {
    return toFailure(err);
  }
}

/** 取消 — cancel the task (supervisor/admin). */
export async function cancelTaskAction(
  id: string,
  expectedVersion: number,
  reason?: string,
): Promise<TaskActionResult> {
  try {
    await actOnWorkItem(id, 'cancel', { expectedVersion, ...(reason ? { reason } : {}) });
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}
