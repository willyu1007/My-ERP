'use server';

/**
 * Server actions for 期末结账 / 反结账 (T-006 M3a UI). They run the data-source
 * close/reopen against the real `/v1` API; when the backend is not configured
 * they return `unconfigured` so the client can show a demo notice.
 */
import { closePeriod, reopenPeriod, tagCashFlow } from '@/lib/finance/data-source';

export type CloseFailure = {
  readonly ok: false;
  readonly reason: 'unconfigured' | 'error';
  readonly message: string;
};

export type CloseResult =
  | { readonly ok: true; readonly period: string; readonly status: string; readonly netProfit?: string }
  | CloseFailure;

function toFailure(err: unknown): CloseFailure {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message.includes('not configured') ? 'unconfigured' : 'error';
  return { ok: false, reason, message };
}

/** 期末结账: 结转损益 + lock the period. */
export async function closePeriodAction(period: string): Promise<CloseResult> {
  try {
    const pc = await closePeriod(period);
    return { ok: true, period: pc.period, status: pc.status, netProfit: pc.netProfit };
  } catch (err) {
    return toFailure(err);
  }
}

/** 反结账: 红冲 the 结转 voucher + reopen. */
export async function reopenPeriodAction(period: string): Promise<CloseResult> {
  try {
    const pc = await reopenPeriod(period);
    return { ok: true, period: pc.period, status: pc.status };
  } catch (err) {
    return toFailure(err);
  }
}

export type TagResult =
  | { readonly ok: true; readonly tagged: number }
  | CloseFailure;

/** Post-hoc 打标: set the 现金流量项目 on a posted voucher's non-cash line(s). */
export async function tagCashFlowAction(input: {
  voucherId: string;
  accountCode: string;
  cashFlowItem: string;
}): Promise<TagResult> {
  try {
    const res = await tagCashFlow({
      voucherId: input.voucherId,
      accountCode: input.accountCode,
      cashFlowItem: input.cashFlowItem || null,
    });
    return { ok: true, tagged: res.tagged };
  } catch (err) {
    return toFailure(err);
  }
}
