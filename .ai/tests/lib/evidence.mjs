/**
 * evidence.mjs
 * Test evidence directory and logging utilities
 */
import fs from 'fs';
import path from 'path';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function generateRunId() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = pad2(now.getUTCMonth() + 1);
  const d = pad2(now.getUTCDate());
  const h = pad2(now.getUTCHours());
  const mi = pad2(now.getUTCMinutes());
  const s = pad2(now.getUTCSeconds());
  const rand = Math.random().toString(16).slice(2, 8);
  return `${y}${mo}${d}-${h}${mi}${s}-${rand}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function createEvidenceDir({ repoRoot, suite, runId }) {
  const evidenceDir = path.join(repoRoot, '.ai', '.tmp', 'tests', suite, runId);
  ensureDir(evidenceDir);
  return evidenceDir;
}

export function createLogger(evidenceDir) {
  const logPath = path.join(evidenceDir, 'runner.log');

  function log(line) {
    const msg = `${line}\n`;
    process.stdout.write(msg);
    try {
      fs.appendFileSync(logPath, msg, 'utf8');
    } catch {
      // best-effort
    }
  }

  function error(line) {
    const msg = `${line}\n`;
    process.stderr.write(msg);
    try {
      fs.appendFileSync(logPath, msg, 'utf8');
    } catch {
      // best-effort
    }
  }

  return { log, error, logPath };
}

export function writeRunJson(evidenceDir, runJson) {
  const outPath = path.join(evidenceDir, 'run.json');
  fs.writeFileSync(outPath, JSON.stringify(runJson, null, 2) + '\n', 'utf8');
  return outPath;
}

export function rmEvidenceDir(evidenceDir) {
  fs.rmSync(evidenceDir, { recursive: true, force: true });
}
