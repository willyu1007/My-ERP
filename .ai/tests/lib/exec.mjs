/**
 * exec.mjs
 * Command execution utilities for tests
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function normalizeLabel(label) {
  return label.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function writeLog(evidenceDir, filename, content) {
  if (!evidenceDir) return;
  const outPath = path.join(evidenceDir, filename);
  fs.writeFileSync(outPath, content ?? '', 'utf8');
}

export function runCommand({ cmd, args, cwd, env, evidenceDir, label, timeoutMs }) {
  const safeLabel = normalizeLabel(label || cmd);

  const res = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';

  if (evidenceDir) {
    writeLog(evidenceDir, `${safeLabel}.stdout.log`, stdout);
    writeLog(evidenceDir, `${safeLabel}.stderr.log`, stderr);
  }

  const code = typeof res.status === 'number' ? res.status : 1;
  const error = res.error;

  return { code, stdout, stderr, error };
}
