/**
 * index.mjs
 * Context-awareness test suite
 */
import * as contextctlSmoke from './contextctl-smoke.mjs';
import * as glossaryVerifyRegressions from './glossary-verify-regressions.mjs';

const TESTS = [contextctlSmoke, glossaryVerifyRegressions];

export function run(ctx) {
  const results = [];
  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][context-awareness] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][context-awareness] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }
  return results;
}
