/**
 * index.mjs
 * UI test suite
 */
import * as uiSystemBootstrap from './ui-system-bootstrap.mjs';
import * as uiGovernanceGate from './ui-governance-gate.mjs';
import * as uiStyleIntake from './ui-style-intake-from-image.mjs';

const TESTS = [uiSystemBootstrap, uiGovernanceGate, uiStyleIntake];

export function run(ctx) {
  const results = [];

  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][ui] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][ui] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }

  return results;
}
