/**
 * index.mjs
 * Maintainer UI test suite
 */
import * as uiGovernanceGateApprovalOrder from './ui-governance-gate-approval-order.mjs';

const TESTS = [uiGovernanceGateApprovalOrder];

export function run(ctx) {
  const results = [];

  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][maintainer][ui] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][maintainer][ui] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }

  return results;
}
