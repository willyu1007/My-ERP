/**
 * cloud-lifecycle.mjs
 * Maintainer-only regression for env-cloudctl lifecycle flows.
 */
import fs from 'fs';

import { assertIncludes, assertNotIncludes } from '../../lib/text.mjs';
import { createMaintainerEnvironmentFixture, readUtf8 } from '../../lib/environment-fixture.mjs';
import { runCommand } from '../../lib/exec.mjs';

export const name = 'environment-cloud-lifecycle';

export function run(ctx) {
  let fixture;
  try {
    fixture = createMaintainerEnvironmentFixture(ctx, name);
  } catch (error) {
    return { name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) };
  }
  if (fixture.skip) {
    ctx.log(`[${name}] SKIP (${fixture.reason})`);
    return { name, status: 'SKIP', reason: fixture.reason };
  }

  const { python, testDir, rootDir, scripts, paths } = fixture;

  const planMd = `${rootDir}/plan.md`;
  const plan = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.cloudctl, 'plan', '--root', rootDir, '--env', 'staging', '--out', planMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.plan`,
  });
  if (plan.error || plan.code !== 0) {
    const detail = plan.error ? String(plan.error) : plan.stderr || plan.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl plan failed: ${detail}` };
  }
  assertIncludes(readUtf8(planMd), 'Status: **PASS**', 'Expected PASS in plan.md');

  const applyMd = `${rootDir}/apply.md`;
  const apply = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.cloudctl, 'apply', '--root', rootDir, '--env', 'staging', '--approve', '--out', applyMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.apply`,
  });
  if (apply.error || apply.code !== 0) {
    const detail = apply.error ? String(apply.error) : apply.stderr || apply.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl apply failed: ${detail}` };
  }
  if (!paths.stagingState || !fs.existsSync(paths.stagingState) || !readUtf8(paths.stagingState)) {
    return { name, status: 'FAIL', error: `missing mock cloud state.json: ${paths.stagingState}` };
  }

  const verifyMd = `${rootDir}/verify.md`;
  const verify = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.cloudctl, 'verify', '--root', rootDir, '--env', 'staging', '--out', verifyMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.verify`,
  });
  if (verify.error || verify.code !== 0) {
    const detail = verify.error ? String(verify.error) : verify.stderr || verify.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl verify failed: ${detail}` };
  }
  assertIncludes(readUtf8(verifyMd), 'Status: **PASS**', 'Expected PASS in verify.md');

  const driftMd = `${rootDir}/drift.md`;
  const drift = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.cloudctl, 'drift', '--root', rootDir, '--env', 'staging', '--out', driftMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.drift`,
  });
  if (drift.error || drift.code !== 0) {
    const detail = drift.error ? String(drift.error) : drift.stderr || drift.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl drift failed: ${detail}` };
  }
  assertIncludes(readUtf8(driftMd), 'Status: **PASS**', 'Expected PASS in drift.md');

  const rotateMd = `${rootDir}/rotate.md`;
  const rotate = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      '-S',
      scripts.cloudctl,
      'rotate',
      '--root',
      rootDir,
      '--env',
      'staging',
      '--secret',
      'api_key',
      '--approve',
      '--out',
      rotateMd,
    ],
    evidenceDir: testDir,
    label: `${name}.cloudctl.rotate`,
  });
  if (rotate.error || rotate.code !== 0) {
    const detail = rotate.error ? String(rotate.error) : rotate.stderr || rotate.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl rotate failed: ${detail}` };
  }
  assertNotIncludes(readUtf8(rotateMd), 'staging-secret', 'Rotate output leaked secret');

  const decomMd = `${rootDir}/decom.md`;
  const decom = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.cloudctl, 'decommission', '--root', rootDir, '--env', 'staging', '--approve', '--out', decomMd],
    evidenceDir: testDir,
    label: `${name}.cloudctl.decommission`,
  });
  if (decom.error || decom.code !== 0) {
    const detail = decom.error ? String(decom.error) : decom.stderr || decom.stdout;
    return { name, status: 'FAIL', error: `env-cloudctl decommission failed: ${detail}` };
  }
  if (fs.existsSync(paths.stagingMockCloudDir)) {
    return { name, status: 'FAIL', error: `expected mock cloud env removed: ${paths.stagingMockCloudDir}` };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
