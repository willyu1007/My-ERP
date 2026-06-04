#!/usr/bin/env node
/**
 * ctl-iac.mjs
 *
 * Minimal IaC feature controller.
 *
 * Commands:
 *   init    Initialize IaC scaffold + context overview.
 *   verify  Verify IaC scaffold + context overview.
 *   status  Show current IaC status.
 */

import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';

const VALID_TOOLS = ['none', 'ros', 'terraform', 'opentofu'];

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/iac/scripts/ctl-iac.mjs <command> [options]

Commands:
  init
    --tool <none|ros|terraform|opentofu>  IaC tool selection (required)
    --repo-root <path>                    Repo root (default: cwd)
    --dry-run                             Show actions without writing

  verify
    --repo-root <path>                    Repo root (default: cwd)
    --tool <none|ros|terraform|opentofu>  Optional override (default: from overview.json)

  status
    --repo-root <path>           Repo root (default: cwd)
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, exitCode = 1) {
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);
  const command = args.shift();
  const opts = {};

  while (args.length > 0) {
    const token = args.shift();
    if (token === '-h' || token === '--help') usage(0);
    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    }
  }
  return { command, opts };
}

function normalizeTool(raw) {
  const tool = String(raw || '').trim().toLowerCase();
  if (!tool) return 'none';
  return tool;
}

function ensureDir(dirPath, dryRun) {
  if (fs.existsSync(dirPath)) {
    return { op: 'skip', path: dirPath, reason: 'exists' };
  }
  if (!dryRun) fs.mkdirSync(dirPath, { recursive: true });
  return { op: 'mkdir', path: dirPath, mode: dryRun ? 'dry-run' : 'applied' };
}

function writeFileIfMissing(filePath, content, dryRun) {
  if (fs.existsSync(filePath)) {
    return { op: 'skip', path: filePath, reason: 'exists' };
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return { op: 'write', path: filePath, mode: dryRun ? 'dry-run' : 'applied' };
}

function writeJson(filePath, data, dryRun) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
  return { op: 'write', path: filePath, mode: dryRun ? 'dry-run' : 'applied' };
}

function nowIso() {
  return new Date().toISOString();
}

function runNode(repoRoot, scriptPath, args) {
  const res = childProcess.spawnSync('node', [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return res;
}

function maybeRegisterContext(repoRoot, overviewPath, dryRun) {
  const registryPath = path.join(repoRoot, 'docs', 'context', 'registry.json');
  const contextctl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
  if (!fs.existsSync(registryPath) || !fs.existsSync(contextctl)) {
    return { op: 'skip', reason: 'context registry not available' };
  }
  const registryRaw = fs.readFileSync(registryPath, 'utf8');
  let registry;
  try {
    registry = JSON.parse(registryRaw);
  } catch {
    return { op: 'skip', reason: 'registry.json invalid' };
  }
  const artifacts = Array.isArray(registry.artifacts) ? registry.artifacts : [];
  const exists = artifacts.some((a) => a && a.id === 'iac-overview');

  if (dryRun) return { op: 'skip', reason: 'dry-run' };

  if (!exists) {
    const res = runNode(repoRoot, contextctl, [
      'add-artifact',
      '--id',
      'iac-overview',
      '--type',
      'json',
      '--path',
      path.relative(repoRoot, overviewPath),
      '--mode',
      'generated',
      '--tags',
      'iac',
    ]);
    if (res.status !== 0) {
      return { op: 'warn', reason: 'ctl-context add-artifact failed', stderr: res.stderr || res.stdout };
    }
    return { op: 'ctl-context', action: 'add-artifact' };
  }

  const res = runNode(repoRoot, contextctl, ['touch', '--repo-root', repoRoot]);
  if (res.status !== 0) {
    return { op: 'warn', reason: 'ctl-context touch failed', stderr: res.stderr || res.stdout };
  }
  return { op: 'ctl-context', action: 'touch' };
}

function cmdInit(repoRoot, tool, dryRun) {
  const actions = [];

  if (tool === 'none') {
    console.log('[skip] iac.tool=none (no scaffold created)');
    return 0;
  }

  if (!VALID_TOOLS.includes(tool)) {
    die(`Invalid tool: ${tool} (expected: ${VALID_TOOLS.join(', ')})`);
  }

  const toolDir = path.join(repoRoot, 'ops', 'iac', tool);
  actions.push(ensureDir(toolDir, dryRun));

  const readmePath = path.join(toolDir, 'README.md');
  const readme = `# IaC SSOT (${tool})\n\n` +
    `This directory is the single source of truth for infrastructure as code.\n\n` +
    `- Plan/apply is owned by humans/CI.\n` +
    `- Do NOT store secrets here.\n` +
    `- Keep environment injection and IaC responsibilities separate.\n`;
  actions.push(writeFileIfMissing(readmePath, readme, dryRun));

  const overviewPath = path.join(repoRoot, 'docs', 'context', 'iac', 'overview.json');
  const overview = {
    generated_at: nowIso(),
    tool,
    ssot_path: `ops/iac/${tool}`,
    notes: [
      'IaC plan/apply is owned by humans/CI.',
      'This overview is generated; do not edit manually.',
    ],
  };
  actions.push(writeJson(overviewPath, overview, dryRun));

  actions.push(maybeRegisterContext(repoRoot, overviewPath, dryRun));

  console.log(`[ok] IaC scaffold initialized (${tool})`);
  for (const a of actions) {
    const note = a.reason ? ` (${a.reason})` : '';
    console.log(`  - ${a.op}: ${path.relative(repoRoot, a.path || overviewPath)}${note}`);
  }
  return 0;
}

function cmdVerify(repoRoot, toolOverride) {
  const errors = [];
  const overviewPath = path.join(repoRoot, 'docs', 'context', 'iac', 'overview.json');
  if (!fs.existsSync(overviewPath)) {
    errors.push(`Missing overview: ${path.relative(repoRoot, overviewPath)}`);
  }

  let tool = normalizeTool(toolOverride);
  if (fs.existsSync(overviewPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(overviewPath, 'utf8'));
      if (!toolOverride) tool = normalizeTool(data.tool);
    } catch {
      errors.push('overview.json is not valid JSON');
    }
  }

  if (!VALID_TOOLS.includes(tool)) {
    errors.push(`Invalid tool in overview: ${tool} (expected: ${VALID_TOOLS.join(', ')})`);
  }

  if (tool !== 'none') {
    const toolDir = path.join(repoRoot, 'ops', 'iac', tool);
    if (!fs.existsSync(toolDir)) {
      errors.push(`Missing IaC SSOT directory: ${path.relative(repoRoot, toolDir)}`);
    }
  }

  if (errors.length > 0) {
    console.error('[error] IaC verify failed:');
    for (const e of errors) console.error(`- ${e}`);
    return 1;
  }

  console.log('[ok] IaC verify passed');
  return 0;
}

function cmdStatus(repoRoot) {
  const overviewPath = path.join(repoRoot, 'docs', 'context', 'iac', 'overview.json');
  if (!fs.existsSync(overviewPath)) {
    console.log('IaC status: not initialized');
    return 0;
  }
  try {
    const data = JSON.parse(fs.readFileSync(overviewPath, 'utf8'));
    console.log('IaC status: initialized');
    console.log(`- tool: ${data.tool || 'unknown'}`);
    console.log(`- ssot_path: ${data.ssot_path || 'unknown'}`);
  } catch {
    console.log('IaC status: overview.json invalid');
  }
  return 0;
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const tool = normalizeTool(opts.tool);
  const dryRun = Boolean(opts['dry-run']);

  if (command === 'init') return cmdInit(repoRoot, tool, dryRun);
  if (command === 'verify') return cmdVerify(repoRoot, opts.tool);
  if (command === 'status') return cmdStatus(repoRoot);

  usage(1);
  return 1;
}

try {
  const rc = main();
  process.exitCode = rc;
} catch (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
}
