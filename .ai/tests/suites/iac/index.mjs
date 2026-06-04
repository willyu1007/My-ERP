/**
 * index.mjs
 * IaC test suite
 */
import * as system from './system.mjs';

const TESTS = [system];

export function run(ctx) {
  const results = [];
  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][iac] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][iac] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }
  return results;
}
