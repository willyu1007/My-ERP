'use server';

/**
 * Server action for 货币资金结算/出纳执行 (T-012 Phase 4, D4). The cashier records that
 * a posted voucher's cash/bank line actually moved — bank-flow reference, attachment,
 * reconciliation — and the paired fund.consume task closes. This NEVER posts a voucher
 * (the backend `consume` path touches no ledger); the real `/v1` re-checks the assignment
 * gate + optimistic version, so a 403/409 surfaces as "已变化，请刷新".
 */
import type { ConsumeFundConsumption } from '@my-erp/api-client';
import { classifyActionFailure } from '@/lib/finance/action-failure';
import { consumeFundConsumption } from '@/lib/finance/data-source';

export type FundActionResult =
  | { readonly ok: true; readonly no: string; readonly executionStatus: string }
  | {
      readonly ok: false;
      readonly reason: 'unconfigured' | 'conflict' | 'error';
      readonly message: string;
    };

export async function consumeFundAction(
  id: string,
  input: ConsumeFundConsumption,
): Promise<FundActionResult> {
  try {
    const fc = await consumeFundConsumption(id, input);
    return { ok: true, no: fc.voucherNo, executionStatus: fc.executionStatus };
  } catch (err) {
    return { ok: false, ...classifyActionFailure(err) };
  }
}
