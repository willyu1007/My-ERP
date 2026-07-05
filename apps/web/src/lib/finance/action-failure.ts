/**
 * Shared failure classification for finance server actions: maps a thrown error
 * to the `{ reason, message }` failure shape the action-result unions use.
 * Superset conflict pattern (includes `no longer`) so all callers agree.
 */
export type ActionFailureReason = 'unconfigured' | 'conflict' | 'error';

export function classifyActionFailure(err: unknown): {
  reason: ActionFailureReason;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message.includes('not configured')
    ? 'unconfigured'
    : /API (403|409)|conflict|stale|已变化|no longer/i.test(message)
      ? 'conflict'
      : 'error';
  return { reason, message };
}
