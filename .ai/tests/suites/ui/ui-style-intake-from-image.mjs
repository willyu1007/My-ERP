/**
 * ui-style-intake-from-image.mjs
 * UI style intake from image test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython } from '../../lib/python.mjs';

export const name = 'ui-style-intake-from-image';

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  fs.mkdirSync(testDir, { recursive: true });

  const samplePath = path.join(testDir, 'sample.png');
  const reportPath = path.join(testDir, 'report.json');

  // 1x1 transparent PNG (dependency-free fixture).
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  fs.writeFileSync(samplePath, Buffer.from(samplePngBase64, 'base64'));

  const probePath = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'ui',
    'ui-style-intake-from-image',
    'scripts',
    'image_style_probe.py'
  );

  const probe = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', probePath, samplePath, '--colors', '6', '--out', reportPath],
    evidenceDir: testDir,
    label: `${name}.probe`,
  });
  if (probe.error || probe.code !== 0) {
    const detail = probe.error ? String(probe.error) : probe.stderr || probe.stdout;
    return { name, status: 'FAIL', error: `probe failed: ${detail}` };
  }

  if (!fs.existsSync(reportPath)) {
    return {
      name,
      status: 'FAIL',
      error: `missing report.json (stdout=${probe.stdout || ''} stderr=${probe.stderr || ''})`,
    };
  }

  const validate = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-m', 'json.tool', reportPath],
    evidenceDir: testDir,
    label: `${name}.json`,
  });
  if (validate.error || validate.code !== 0) {
    const detail = validate.error ? String(validate.error) : validate.stderr || validate.stdout;
    return { name, status: 'FAIL', error: `invalid json output: ${detail}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (e) {
    return { name, status: 'FAIL', error: `failed to parse report.json: ${e.message}` };
  }

  // Either full probe output (Pillow installed) or structured fallback payload.
  const isFallback = parsed && parsed.ok === false && parsed.error === 'missing_dependency';
  const isFull = parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number';
  if (!isFallback && !isFull) {
    return { name, status: 'FAIL', error: 'unexpected report shape from image style probe' };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
