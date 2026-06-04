/**
 * ui-governance-gate.mjs
 * UI governance gate test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython } from '../../lib/python.mjs';

export const name = 'ui-governance-gate';

function listDirs(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function latestRunId(dirPath) {
  const ids = listDirs(dirPath).sort();
  return ids.length ? ids[ids.length - 1] : null;
}

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  const repoDir = path.join(testDir, 'repo');
  fs.mkdirSync(path.join(repoDir, 'ui'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'docs', 'context', 'ui'), { recursive: true });

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

  const bootTemplate = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'ui',
    'ui-system-bootstrap',
    'assets',
    'ui-template'
  );
  const bootUi = path.join(bootTemplate, 'ui');
  const bootDocs = path.join(bootTemplate, 'docs', 'context', 'ui');
  if (fs.existsSync(bootUi)) {
    fs.cpSync(bootUi, path.join(repoDir, 'ui'), { recursive: true, force: true });
    if (fs.existsSync(bootDocs)) {
      fs.cpSync(bootDocs, path.join(repoDir, 'docs', 'context', 'ui'), { recursive: true, force: true });
    }
  }

  const appPath = path.join(repoDir, 'src', 'App.tsx');
  fs.writeFileSync(
    appPath,
    `export function App() {\n` +
      `  return (\n` +
      `    <div data-ui="page" data-layout="app" data-density="comfortable">\n` +
      `      <div data-slot="header">\n` +
      `        <div data-ui="toolbar" data-align="between" data-wrap="nowrap" className="flex items-center justify-between">\n` +
      `          <div data-ui="text" data-variant="h2" data-tone="primary">Title</div>\n` +
      `          <button data-ui="button" data-variant="primary" data-size="md" data-state="default">Save</button>\n` +
      `        </div>\n` +
      `      </div>\n` +
      `      <div data-slot="content">\n` +
      `        <div data-ui="card" data-padding="md" data-elevation="sm">\n` +
      `          <div data-slot="body">\n` +
      `            <div data-ui="field" data-state="default">\n` +
      `              <label data-slot="label" data-ui="text" data-variant="label" data-tone="secondary">Name</label>\n` +
      `              <input data-slot="control" data-ui="input" data-size="md" data-state="default" />\n` +
      `            </div>\n` +
      `          </div>\n` +
      `        </div>\n` +
      `      </div>\n` +
      `    </div>\n` +
      `  );\n` +
      `}\n`,
    'utf8'
  );

  const first = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      scriptPath,
      'run',
      '--repo-root',
      repoDir,
      '--mode',
      'full',
      '--fail-on',
      'warnings',
    ],
    evidenceDir: testDir,
    label: `${name}.run.initial`,
  });
  if (first.error || first.code !== 0) {
    const detail = first.error ? String(first.error) : first.stderr || first.stdout;
    return { name, status: 'FAIL', error: `initial gate run failed: ${detail}` };
  }

  // Introduce a SSOT change (token) to exercise real-time approval.
  const tokenPath = path.join(repoDir, 'ui', 'tokens', 'base.json');
  if (!fs.existsSync(tokenPath)) {
    return { name, status: 'FAIL', error: `missing token file: ${tokenPath}` };
  }
  const obj = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  obj.meta = obj.meta || {};
  obj.meta.smoke_test_touched = true;
  fs.writeFileSync(tokenPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');

  const second = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      scriptPath,
      'run',
      '--repo-root',
      repoDir,
      '--mode',
      'full',
      '--fail-on',
      'errors',
    ],
    evidenceDir: testDir,
    label: `${name}.run.expect-approval`,
  });
  if (second.error) {
    return { name, status: 'FAIL', error: `approval-required run errored: ${String(second.error)}` };
  }
  if (second.code === 0) {
    return { name, status: 'FAIL', error: 'expected approval-required failure but gate passed' };
  }

  const uiTmpDir = path.join(repoDir, '.ai', '.tmp', 'ui');
  const rid = latestRunId(uiTmpDir);
  if (!rid) {
    return { name, status: 'FAIL', error: `expected ui evidence dir under: ${uiTmpDir}` };
  }

  const requestPath = path.join(uiTmpDir, rid, 'approval.request.json');
  if (!fs.existsSync(requestPath)) {
    return { name, status: 'FAIL', error: `missing approval request: ${requestPath}` };
  }

  const approve = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      scriptPath,
      'approval-approve',
      '--repo-root',
      repoDir,
      '--request',
      requestPath,
      '--approved-by',
      'smoke-tester',
      '--expires-at-utc',
      '9999-12-31T00:00:00Z',
    ],
    evidenceDir: testDir,
    label: `${name}.approval.approve`,
  });
  if (approve.error || approve.code !== 0) {
    const detail = approve.error ? String(approve.error) : approve.stderr || approve.stdout;
    return { name, status: 'FAIL', error: `approval failed: ${detail}` };
  }

  const third = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      scriptPath,
      'run',
      '--repo-root',
      repoDir,
      '--mode',
      'full',
      '--fail-on',
      'warnings',
    ],
    evidenceDir: testDir,
    label: `${name}.run.after-approval`,
  });
  if (third.error || third.code !== 0) {
    const detail = third.error ? String(third.error) : third.stderr || third.stdout;
    return { name, status: 'FAIL', error: `gate run after approval failed: ${detail}` };
  }

  // Introduce a violation: Tailwind color class + dynamic data-ui attribute value.
  fs.appendFileSync(
    appPath,
    `\n// violation\nconst X = <div className="text-red-500" />;\nconst Y = <div className={clsx("text-red-500")} />;\nconst Z = <button data-ui="button" data-variant={variant} />;\n`,
    'utf8'
  );

  const fourth = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', scriptPath, 'run', '--repo-root', repoDir, '--fail-on', 'errors'],
    evidenceDir: testDir,
    label: `${name}.run.expect-violation`,
  });
  if (fourth.error) {
    return { name, status: 'FAIL', error: `violation run errored: ${String(fourth.error)}` };
  }
  if (fourth.code === 0) {
    return { name, status: 'FAIL', error: 'expected failure but gate passed' };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
