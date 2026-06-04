/**
 * index.mjs
 * Deployment test suite
 */
import * as deployctlSmoke from './deployctl-smoke.mjs';

const TESTS = [deployctlSmoke];

export function run(ctx) {
  const results = [];
  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][deployment] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][deployment] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }
  return results;
}
