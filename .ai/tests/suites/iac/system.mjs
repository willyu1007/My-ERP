/**
 * system.mjs
 * IaC system test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';

export const name = 'iac-system';

export function run(ctx) {
  const testDir = path.join(ctx.evidenceDir, name);
  const rootDir = path.join(testDir, 'fixture');
  fs.mkdirSync(rootDir, { recursive: true });

  const iacctl = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'iac',
    'scripts',
    'ctl-iac.mjs'
  );

  const init = runCommand({
    cmd: 'node',
    args: [iacctl, 'init', '--tool', 'terraform', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.init`,
  });
  if (init.error || init.code !== 0) {
    const detail = init.error ? String(init.error) : init.stderr || init.stdout;
    return { name, status: 'FAIL', error: `iacctl init failed: ${detail}` };
  }

  const readmePath = path.join(rootDir, 'ops', 'iac', 'terraform', 'README.md');
  const overviewPath = path.join(rootDir, 'docs', 'context', 'iac', 'overview.json');
  if (!fs.existsSync(readmePath)) {
    return { name, status: 'FAIL', error: 'missing ops/iac/terraform/README.md' };
  }
  if (!fs.existsSync(overviewPath)) {
    return { name, status: 'FAIL', error: 'missing docs/context/iac/overview.json' };
  }

  const verify = runCommand({
    cmd: 'node',
    args: [iacctl, 'verify', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.verify`,
  });
  if (verify.error || verify.code !== 0) {
    const detail = verify.error ? String(verify.error) : verify.stderr || verify.stdout;
    return { name, status: 'FAIL', error: `iacctl verify failed: ${detail}` };
  }

  return { name, status: 'PASS' };
}
