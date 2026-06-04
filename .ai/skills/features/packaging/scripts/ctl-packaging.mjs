#!/usr/bin/env node
/**
 * ctl-packaging.mjs
 *
 * Packaging configuration management for the Packaging feature.
 *
 * Commands:
 *   init              Initialize packaging configuration (idempotent)
 *   list              List packaging targets
 *   add               Add a packaging target
 *   add-service       Add a service target (alias)
 *   add-job           Add a job target (alias)
 *   add-app           Add an app target (alias)
 *   remove            Remove a packaging target
 *   build             Build a target (human-executed)
 *   build-all         Build all targets (human-executed)
 *   verify            Verify packaging configuration
 *   status            Show packaging status
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/packaging/scripts/ctl-packaging.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize packaging configuration.

  list
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List packaging targets.

  add
    --id <string>               Target id (required)
    --name <string>             Alias for --id
    --type <service|job|app>    Target type (required)
    --module <path>             Source module path (recommended)
    --dockerfile <path>         Dockerfile path (default: ops/packaging/<type>s/<id>.Dockerfile)
    --template <node|python|go|path>  Optional Dockerfile template to seed the dockerfile
    --context <path>            Build context path (default: --module or ".")
    --image <string>            Image repository (default: <id>)
    --repo-root <path>          Repo root (default: cwd)
    Add a packaging target.

  add-service
    --id <string>               Target id (required)
    --module <path>             Source module path (recommended)
    --repo-root <path>          Repo root (default: cwd)
    Convenience alias for: add --type service

  add-job
    --id <string>               Target id (required)
    --module <path>             Source module path (recommended)
    --repo-root <path>          Repo root (default: cwd)
    Convenience alias for: add --type job

  add-app
    --id <string>               Target id (required)
    --module <path>             Source module path (recommended)
    --repo-root <path>          Repo root (default: cwd)
    Convenience alias for: add --type app

  remove
    --id <string>               Target id (required)
    --name <string>             Alias for --id
    --repo-root <path>          Repo root (default: cwd)
    Remove a packaging target.

  build
    --target <id>               Target id (required)
    --tag <tag>                 Image tag (default: latest)
    --repo-root <path>          Repo root (default: cwd)
    Build a target via docker (human-executed).

  build-all
    --tag <tag>                 Image tag (default: latest)
    --repo-root <path>          Repo root (default: cwd)
    Build all targets via docker (human-executed).

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify packaging configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show packaging status.

Examples:
  node .ai/skills/features/packaging/scripts/ctl-packaging.mjs init
  node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-service --id api --module apps/backend
  node .ai/skills/features/packaging/scripts/ctl-packaging.mjs list
  node .ai/skills/features/packaging/scripts/ctl-packaging.mjs build --target api --tag v1.0.0
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

// ============================================================================
// File Utilities
// ============================================================================

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return { op: 'mkdir', path: dirPath };
  }
  return { op: 'skip', path: dirPath, reason: 'exists' };
}

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    return { op: 'skip', path: filePath, reason: 'exists' };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

// ============================================================================
// Packaging Management
// ============================================================================

function getPackagingDir(repoRoot) {
  return path.join(repoRoot, 'ops', 'packaging');
}

function resolveHandbookDir(baseDir) {
  const handbookDir = path.join(baseDir, 'handbook');
  const legacyWorkdocsDir = path.join(baseDir, 'workdocs');

  if (fs.existsSync(handbookDir)) return { dir: handbookDir, legacy: false };
  if (fs.existsSync(legacyWorkdocsDir)) return { dir: legacyWorkdocsDir, legacy: true };
  return { dir: handbookDir, legacy: false };
}

function getRegistryPath(repoRoot) {
  return path.join(repoRoot, 'docs', 'packaging', 'registry.json');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRegistry(raw) {
  const now = nowIso();
  const reg = raw && typeof raw === 'object' ? raw : {};
  const targets = Array.isArray(reg.targets) ? reg.targets : [];

  const normalizedTargets = targets
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const id = String(t.id || t.name || '').trim();
      const type = String(t.type || '').trim();
      if (!id || !type) return null;
      return {
        id,
        type,
        ...(t.module ? { module: String(t.module) } : {}),
        ...(t.dockerfile ? { dockerfile: String(t.dockerfile) } : {}),
        ...(t.context ? { context: String(t.context) } : {}),
        ...(t.image ? { image: String(t.image) } : {}),
        ...(t.addedAt ? { addedAt: String(t.addedAt) } : {})
      };
    })
    .filter(Boolean);

  return {
    version: 1,
    updatedAt: reg.updatedAt || reg.lastUpdated || now,
    targets: normalizedTargets
  };
}

function loadRegistry(repoRoot) {
  return normalizeRegistry(readJson(getRegistryPath(repoRoot)));
}

function saveRegistry(repoRoot, registry) {
  const normalized = normalizeRegistry(registry);
  normalized.updatedAt = nowIso();
  writeJson(getRegistryPath(repoRoot), normalized);
}

function getDefaultDockerfilePath(type, id) {
  return `ops/packaging/${type}s/${id}.Dockerfile`;
}

function getTemplatePath(repoRoot, template) {
  if (!template) return null;
  const t = String(template).trim();
  if (!t) return null;
  if (t === 'node') return path.join(repoRoot, 'ops', 'packaging', 'templates', 'Dockerfile.node');
  if (t === 'python') return path.join(repoRoot, 'ops', 'packaging', 'templates', 'Dockerfile.python');
  if (t === 'go') return path.join(repoRoot, 'ops', 'packaging', 'templates', 'Dockerfile.go');
  return path.isAbsolute(t) ? t : path.join(repoRoot, t);
}

function ensureDockerfile(repoRoot, dockerfileRel, template) {
  const dockerfileAbs = path.join(repoRoot, dockerfileRel);
  if (fs.existsSync(dockerfileAbs)) return { op: 'skip', path: dockerfileAbs, reason: 'exists' };

  const templatePath = getTemplatePath(repoRoot, template);
  if (templatePath && fs.existsSync(templatePath)) {
    const content = fs.readFileSync(templatePath, 'utf8');
    return writeFileIfMissing(dockerfileAbs, content);
  }

  const fallback = `# Dockerfile (generated placeholder)\n# Generated: ${nowIso()}\n# Tip: copy and customize a template from ops/packaging/templates/\n\nFROM scratch\n`;
  return writeFileIfMissing(dockerfileAbs, fallback);
}

function runDockerBuild(repoRoot, dockerfileRel, tag, contextRel) {
  const scriptPath = path.join(repoRoot, 'ops', 'packaging', 'scripts', 'docker-build.mjs');
  if (!fs.existsSync(scriptPath)) {
    die('[error] ops/packaging/scripts/docker-build.mjs not found. Run: ctl-packaging init');
  }

  const args = ['--dockerfile', dockerfileRel, '--tag', tag];
  if (contextRel) args.push('--context', contextRel);

  console.log(`[info] Running: node ${path.relative(repoRoot, scriptPath)} ${args.join(' ')}`);
  const res = spawnSync('node', [scriptPath, ...args], { cwd: repoRoot, stdio: 'inherit' });
  if (res.status !== 0) {
    die(`[error] docker-build failed with code ${res.status}`);
  }
}

function applyDockerTag(imageRef, tag) {
  const ref = String(imageRef || '').trim();
  const t = String(tag || 'latest').trim() || 'latest';
  if (!ref) return '';

  const lastSlash = ref.lastIndexOf('/');
  const lastColon = ref.lastIndexOf(':');
  const hasTag = lastColon > lastSlash;
  const repository = hasTag ? ref.slice(0, lastColon) : ref;
  return `${repository}:${t}`;
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const packagingDir = getPackagingDir(repoRoot);
  const { dir: handbookDir, legacy: usesLegacyWorkdocsDir } = resolveHandbookDir(packagingDir);
  const actions = [];

  const dirs = [
    packagingDir,
    path.join(packagingDir, 'services'),
    path.join(packagingDir, 'jobs'),
    path.join(packagingDir, 'apps'),
    path.join(packagingDir, 'scripts'),
    handbookDir,
    path.join(repoRoot, 'docs', 'packaging')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  const registryPath = getRegistryPath(repoRoot);
  if (!fs.existsSync(registryPath) && !dryRun) {
    saveRegistry(repoRoot, { version: 1, updatedAt: nowIso(), targets: [] });
    actions.push({ op: 'write', path: registryPath });
  }

  console.log('[ok] Packaging configuration initialized.');
  if (usesLegacyWorkdocsDir) {
    console.log('[warn] Detected legacy ops/packaging/workdocs/. Consider renaming to ops/packaging/handbook/.');
  }
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdList(repoRoot, format) {
  const registry = loadRegistry(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`Packaging Targets (${registry.targets.length}):\n`);
  if (registry.targets.length === 0) {
    console.log('  (no targets defined)');
    return;
  }

  for (const target of registry.targets) {
    console.log(`  [${target.type}] ${target.id}${target.module ? ` -> ${target.module}` : ''}`);
  }
}

function cmdAdd(repoRoot, id, type, modulePath, dockerfilePath, template, contextPath, image) {
  if (!id) die('[error] --id is required');
  if (!type) die('[error] --type is required');

  const validTypes = ['service', 'job', 'app'];
  if (!validTypes.includes(type)) {
    die(`[error] --type must be one of: ${validTypes.join(', ')}`);
  }

  const registry = loadRegistry(repoRoot);
  if (registry.targets.find(t => t.id === id)) {
    die(`[error] Target "${id}" already exists`);
  }

  const dockerfileRel = dockerfilePath ? String(dockerfilePath) : getDefaultDockerfilePath(type, id);
  const moduleRel = modulePath ? String(modulePath) : undefined;
  const contextRel = contextPath ? String(contextPath) : (moduleRel || '.');
  const imageRepo = image ? String(image) : id;

  registry.targets.push({
    id,
    type,
    ...(moduleRel ? { module: moduleRel } : {}),
    dockerfile: dockerfileRel,
    context: contextRel,
    image: imageRepo,
    addedAt: nowIso()
  });
  saveRegistry(repoRoot, registry);

  // Ensure dockerfile exists (copy-if-missing)
  ensureDir(path.dirname(path.join(repoRoot, dockerfileRel)));
  ensureDockerfile(repoRoot, dockerfileRel, template);

  console.log(`[ok] Added packaging target: ${id} (${type})`);
}

function cmdRemove(repoRoot, id) {
  if (!id) die('[error] --id is required');

  const registry = loadRegistry(repoRoot);
  const index = registry.targets.findIndex(t => t.id === id);
  if (index === -1) {
    die(`[error] Target "${id}" not found`);
  }

  registry.targets.splice(index, 1);
  saveRegistry(repoRoot, registry);
  console.log(`[ok] Removed packaging target: ${id}`);
}

function cmdBuild(repoRoot, targetId, tag) {
  if (!targetId) die('[error] --target is required');
  const t = String(tag || 'latest').trim() || 'latest';

  const registry = loadRegistry(repoRoot);
  const target = registry.targets.find((x) => x.id === targetId);
  if (!target) die(`[error] Target "${targetId}" not found. Run: ctl-packaging list`);

  const dockerfileRel = target.dockerfile || getDefaultDockerfilePath(target.type, target.id);
  const contextRel = target.context || target.module || '.';

  if (!fs.existsSync(path.join(repoRoot, dockerfileRel))) {
    die(`[error] Dockerfile not found: ${dockerfileRel}`);
  }

  const imageRepo = target.image || target.id;
  const imageTag = applyDockerTag(imageRepo, t);
  runDockerBuild(repoRoot, dockerfileRel, imageTag, contextRel);
}

function cmdBuildAll(repoRoot, tag) {
  const registry = loadRegistry(repoRoot);
  if (registry.targets.length === 0) {
    die('[error] No targets defined. Run: ctl-packaging add-service ...');
  }
  for (const target of registry.targets) {
    cmdBuild(repoRoot, target.id, tag);
  }
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getPackagingDir(repoRoot))) {
    errors.push('ops/packaging/ not found. Run: ctl-packaging init');
  }

  const registry = loadRegistry(repoRoot);
  if (registry.targets.length === 0) {
    warnings.push('No packaging targets defined');
  }

  for (const t of registry.targets) {
    if (!t.dockerfile) {
      warnings.push(`Target "${t.id}" has no dockerfile path`);
      continue;
    }
    if (!fs.existsSync(path.join(repoRoot, t.dockerfile))) {
      warnings.push(`Missing Dockerfile for "${t.id}": ${t.dockerfile}`);
    }
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const ok = errors.length === 0;
  console.log(ok ? '[ok] Packaging configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdStatus(repoRoot, format) {
  const registry = loadRegistry(repoRoot);
  const status = {
    initialized: fs.existsSync(getPackagingDir(repoRoot)),
    targets: registry.targets.length,
    updatedAt: registry.updatedAt
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Packaging Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Targets: ${status.targets}`);
  console.log(`  Updated at: ${status.updatedAt || 'never'}`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();

  switch (command) {
    case 'help':
      usage(0);
      break;
    case 'init':
      cmdInit(repoRoot, !!opts['dry-run']);
      break;
    case 'list':
      cmdList(repoRoot, format);
      break;
    case 'add':
      cmdAdd(
        repoRoot,
        opts['id'] || opts['name'],
        opts['type'],
        opts['module'],
        opts['dockerfile'],
        opts['template'],
        opts['context'],
        opts['image']
      );
      break;
    case 'add-service':
      cmdAdd(repoRoot, opts['id'] || opts['name'], 'service', opts['module'], opts['dockerfile'], opts['template'], opts['context'], opts['image']);
      break;
    case 'add-job':
      cmdAdd(repoRoot, opts['id'] || opts['name'], 'job', opts['module'], opts['dockerfile'], opts['template'], opts['context'], opts['image']);
      break;
    case 'add-app':
      cmdAdd(repoRoot, opts['id'] || opts['name'], 'app', opts['module'], opts['dockerfile'], opts['template'], opts['context'], opts['image']);
      break;
    case 'remove':
      cmdRemove(repoRoot, opts['id'] || opts['name']);
      break;
    case 'build':
      cmdBuild(repoRoot, opts['target'], opts['tag']);
      break;
    case 'build-all':
      cmdBuildAll(repoRoot, opts['tag']);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
