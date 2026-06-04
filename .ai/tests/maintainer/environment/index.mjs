/**
 * index.mjs
 * Maintainer environment test suite
 */
import * as cloudLifecycle from './cloud-lifecycle.mjs';

const TESTS = [cloudLifecycle];

export function run(ctx) {
  const results = [];
  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][maintainer][environment] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][maintainer][environment] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }
  return results;
}
