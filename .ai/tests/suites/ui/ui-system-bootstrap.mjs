/**
 * ui-system-bootstrap.mjs
 * UI system bootstrap test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython } from '../../lib/python.mjs';

export const name = 'ui-system-bootstrap';

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  fs.mkdirSync(testDir, { recursive: true });

  const scriptPath = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'ui',
    'ui-system-bootstrap',
    'scripts',
    'ui_specctl.py'
  );

  const initRes = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', scriptPath, 'init'],
    cwd: testDir,
    evidenceDir: testDir,
    label: `${name}.init`,
  });
  if (initRes.error || initRes.code !== 0) {
    const detail = initRes.error ? String(initRes.error) : initRes.stderr || initRes.stdout;
    return { name, status: 'FAIL', error: `init failed: ${detail}` };
  }

  const validateRes = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', scriptPath, 'validate'],
    cwd: testDir,
    evidenceDir: testDir,
    label: `${name}.validate`,
  });
  if (validateRes.error || validateRes.code !== 0) {
    const detail = validateRes.error ? String(validateRes.error) : validateRes.stderr || validateRes.stdout;
    return { name, status: 'FAIL', error: `validate failed: ${detail}` };
  }

  const expectedFiles = [
    'ui/tokens/base.json',
    'ui/contract/contract.json',
    'ui/styles/ui.css',
    'ui/styles/tokens.css',
    'ui/styles/contract.css',
    'ui/codegen/contract-types.ts',
    'docs/context/ui/ui-spec.json',
  ];

  for (const rel of expectedFiles) {
    const abs = path.join(testDir, rel);
    if (!fs.existsSync(abs)) {
      return { name, status: 'FAIL', error: `missing expected file: ${rel}` };
    }
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
