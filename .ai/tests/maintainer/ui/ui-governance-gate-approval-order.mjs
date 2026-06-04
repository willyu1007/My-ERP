/**
 * ui-governance-gate-approval-order.mjs
 * Regression test: same-second approvals must resolve to the newest file by mtime.
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython } from '../../lib/python.mjs';

export const name = 'ui-governance-gate-approval-order';

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  const repoDir = path.join(testDir, 'repo');

  const approvalsDir = path.join(repoDir, 'ui', 'approvals');
  fs.mkdirSync(approvalsDir, { recursive: true });

  writeJson(path.join(repoDir, 'ui', 'tokens', 'base.json'), { meta: { version: 1 } });
  writeJson(path.join(repoDir, 'ui', 'contract', 'contract.json'), { meta: { version: 1 }, roles: {} });

  const approvedAt = '2026-02-07T00:00:00Z';
  const oldPath = path.join(approvalsDir, '20260207T000000Z-spec_change-z9999999.json');
  const newPath = path.join(approvalsDir, '20260207T000000Z-spec_change-a1111111.json');

  writeJson(oldPath, {
    approval_version: 1,
    approval_type: 'spec_change',
    approved_at_utc: approvedAt,
    approved_by: 'baseline',
    fingerprint: 'old-fingerprint',
  });
  writeJson(newPath, {
    approval_version: 1,
    approval_type: 'spec_change',
    approved_at_utc: approvedAt,
    approved_by: 'reviewer',
    fingerprint: 'new-fingerprint',
  });

  fs.utimesSync(oldPath, new Date('2026-02-07T00:00:00.000Z'), new Date('2026-02-07T00:00:00.000Z'));
  fs.utimesSync(newPath, new Date('2026-02-07T00:00:00.000Z'), new Date('2026-02-07T00:00:01.000Z'));

  const scriptPath = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'ui',
    'ui-governance-gate',
    'scripts',
    'ui_gate.py'
  );

  const status = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', scriptPath, 'approval-status', '--repo-root', repoDir],
    evidenceDir: testDir,
    label: `${name}.approval-status`,
  });
  if (status.error || status.code !== 0) {
    const detail = status.error ? String(status.error) : status.stderr || status.stdout;
    return { name, status: 'FAIL', error: `approval-status failed: ${detail}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(String(status.stdout || '{}'));
  } catch (e) {
    return { name, status: 'FAIL', error: `approval-status returned non-JSON output: ${e.message}` };
  }

  const latestFp = parsed && parsed.latest_spec ? parsed.latest_spec.fingerprint : null;
  if (latestFp !== 'new-fingerprint') {
    return {
      name,
      status: 'FAIL',
      error: `latest_spec fingerprint mismatch: expected "new-fingerprint", got "${latestFp}"`,
    };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
