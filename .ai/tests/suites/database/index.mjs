/**
 * index.mjs
 * Database test suite
 */
import * as sqliteSmoke from './sqlite-smoke.mjs';
import * as convexInitContractSmoke from './convex-init-contract-smoke.mjs';
import * as convexDriftVerifySmoke from './convex-drift-verify-smoke.mjs';
import * as convexDbDocSurfaceSmoke from './convex-db-doc-surface-smoke.mjs';

const TESTS = [
  sqliteSmoke,
  convexInitContractSmoke,
  convexDriftVerifySmoke,
  convexDbDocSurfaceSmoke,
];

export function run(ctx) {
  const results = [];
  for (const t of TESTS) {
    const name = t.name || 'unnamed-test';
    ctx.log(`[tests][database] start: ${name}`);
    const res = t.run(ctx);
    results.push(res);
    ctx.log(`[tests][database] done: ${name} (${res.status})`);
    if (res.status === 'FAIL') break;
  }
  return results;
}
