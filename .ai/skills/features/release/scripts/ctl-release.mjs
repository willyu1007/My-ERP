#!/usr/bin/env node
/**
 * ctl-release.mjs
 *
 * Release management for the Release feature.
 *
 * Safety model:
 * - This tool plans releases and maintains config/templates.
 * - It does NOT create git tags or publish releases automatically.
 *
 * Commands:
 *   init              Initialize release configuration (idempotent)
 *   status            Show release status
 *   prepare           Prepare a new release version
 *   changelog         Print changelog guidance (no generation)
 *   tag               Print git tag guidance (no tag creation)
 *   verify            Verify release configuration
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';

const VALID_STRATEGIES = new Set(['semantic', 'calendar', 'manual']);

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/release/scripts/ctl-release.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>                 Repo root (default: cwd)
    --strategy <semantic|calendar|manual>  Strategy (default: semantic)
    --dry-run                          Show what would be created
    Initialize release configuration (idempotent).

  status
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    Show release status.

  prepare
    --version <string>                 Version to prepare (required)
    --repo-root <path>                 Repo root (default: cwd)
    Prepare a new release version (updates release/config.json; does not tag).

  changelog
    --from <ref>                       Optional git ref (default: last tag / manual)
    --to <ref>                         Optional git ref (default: HEAD)
    --repo-root <path>                 Repo root (default: cwd)
    Print guidance for producing a changelog entry (no generation).

  tag
    --version <string>                 Version to tag (default: release/config.json currentVersion)
    --repo-root <path>                 Repo root (default: cwd)
    Print git tag commands (no tag creation).

  verify
    --repo-root <path>                 Repo root (default: cwd)
    Verify release configuration.

Examples:
  node .ai/skills/features/release/scripts/ctl-release.mjs init --strategy semantic
  node .ai/skills/features/release/scripts/ctl-release.mjs status
  node .ai/skills/features/release/scripts/ctl-release.mjs prepare --version 1.2.0
  node .ai/skills/features/release/scripts/ctl-release.mjs changelog --from v1.1.0 --to HEAD
  node .ai/skills/features/release/scripts/ctl-release.mjs tag --version 1.2.0
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

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
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

function copyFileIfMissing(src, dest) {
  if (!fs.existsSync(src)) return { op: 'skip', path: dest, reason: `missing source: ${src}` };
  if (fs.existsSync(dest)) return { op: 'skip', path: dest, reason: 'exists' };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return { op: 'write', path: dest };
}

// ============================================================================
// Release Management
// ============================================================================

function getReleaseDir(repoRoot) {
  return path.join(repoRoot, 'release');
}

function resolveHandbookDir(baseDir) {
  const handbookDir = path.join(baseDir, 'handbook');
  const legacyWorkdocsDir = path.join(baseDir, 'workdocs');

  if (fs.existsSync(handbookDir)) return { dir: handbookDir, legacy: false };
  if (fs.existsSync(legacyWorkdocsDir)) return { dir: legacyWorkdocsDir, legacy: true };
  return { dir: handbookDir, legacy: false };
}

function getConfigPath(repoRoot) {
  return path.join(getReleaseDir(repoRoot), 'config.json');
}

function getChangelogTemplatePath(repoRoot) {
  return path.join(getReleaseDir(repoRoot), 'changelog-template.md');
}

function getRootChangelogPath(repoRoot) {
  return path.join(getReleaseDir(repoRoot), 'CHANGELOG.md');
}

function normalizeStrategy(strategy) {
  const s = String(strategy || 'semantic').trim().toLowerCase();
  return VALID_STRATEGIES.has(s) ? s : 'semantic';
}

function normalizeConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const strategy = normalizeStrategy(cfg.strategy);

  const branches = (cfg.branches && typeof cfg.branches === 'object')
    ? cfg.branches
    : { main: 'main', develop: 'develop' };

  const history = Array.isArray(cfg.history)
    ? cfg.history
    : Array.isArray(cfg.releases)
      ? cfg.releases
      : [];

  return {
    version: 1,
    updatedAt: cfg.updatedAt || cfg.lastUpdated || nowIso(),
    strategy,
    currentVersion: String(cfg.currentVersion ?? '0.0.0'),
    changelog: cfg.changelog !== undefined ? !!cfg.changelog : true,
    branches,
    ...(history.length > 0 ? { history } : {})
  };
}

function loadConfig(repoRoot) {
  return normalizeConfig(readJson(getConfigPath(repoRoot)));
}

function saveConfig(repoRoot, config) {
  const normalized = normalizeConfig(config);
  normalized.updatedAt = nowIso();
  writeJson(getConfigPath(repoRoot), normalized);
}

function validateVersion(strategy, version) {
  const v = String(version || '').trim();
  if (!v) return { ok: false, error: 'Version is required.' };

  if (strategy === 'semantic') {
    const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    if (!semver.test(v)) return { ok: false, error: 'Version must be semantic (e.g., 1.2.3 or 1.2.3-rc.1).' };
  }

  if (strategy === 'calendar') {
    const calver = /^\d{4}\.\d{2}\.\d{2}$/;
    if (!calver.test(v)) return { ok: false, error: 'Version must be calendar (YYYY.MM.DD).' };
  }

  return { ok: true, value: v };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun, strategy) {
  const releaseDir = getReleaseDir(repoRoot);
  const { dir: handbookDir, legacy: usesLegacyWorkdocsDir } = resolveHandbookDir(releaseDir);
  const actions = [];

  const dirs = [releaseDir, handbookDir];
  for (const dir of dirs) {
    actions.push(dryRun ? { op: 'mkdir', path: dir, mode: 'dry-run' } : ensureDir(dir));
  }

  const normalizedStrategy = normalizeStrategy(strategy);

  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath) && !dryRun) {
    saveConfig(repoRoot, {
      version: 1,
      updatedAt: nowIso(),
      strategy: normalizedStrategy,
      currentVersion: '0.0.0',
      changelog: true,
      branches: { main: 'main', develop: 'develop' }
    });
    actions.push({ op: 'write', path: configPath });
  }

  const agentsPath = path.join(releaseDir, 'AGENTS.md');
  const agentsContent = `# Release Management (LLM-first)

## Commands

\`\`\`bash
node .ai/skills/features/release/scripts/ctl-release.mjs init --strategy semantic
node .ai/skills/features/release/scripts/ctl-release.mjs status
node .ai/skills/features/release/scripts/ctl-release.mjs prepare --version 1.0.0
node .ai/skills/features/release/scripts/ctl-release.mjs changelog --from v0.9.0 --to HEAD
node .ai/skills/features/release/scripts/ctl-release.mjs tag --version 1.0.0
\`\`\`

## Safety

- Humans approve and execute git tagging and publishing.
- Never commit secrets in release notes.
`;
  actions.push(dryRun ? { op: 'write', path: agentsPath, mode: 'dry-run' } : writeFileIfMissing(agentsPath, agentsContent));

  const changelogTemplatePath = getChangelogTemplatePath(repoRoot);
  const changelogTemplateContent = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
`;
  actions.push(dryRun ? { op: 'write', path: changelogTemplatePath, mode: 'dry-run' } : writeFileIfMissing(changelogTemplatePath, changelogTemplateContent));

  // Optional: seed release/CHANGELOG.md (copy-if-missing)
  const rootChangelogPath = getRootChangelogPath(repoRoot);
  if (dryRun) {
    actions.push({ op: 'write', path: rootChangelogPath, mode: 'dry-run' });
  } else if (!fs.existsSync(rootChangelogPath)) {
    const content = fs.readFileSync(changelogTemplatePath, 'utf8');
    actions.push(writeFileIfMissing(rootChangelogPath, content));
  }

  // Optional: create .releaserc.json from template (copy-if-missing) for semantic strategy
  const templateRc = path.join(releaseDir, '.releaserc.json.template');
  const rc = path.join(repoRoot, '.releaserc.json');
  if (normalizedStrategy === 'semantic') {
    actions.push(dryRun ? { op: 'write', path: rc, mode: 'dry-run' } : copyFileIfMissing(templateRc, rc));
  }

  console.log('[ok] Release configuration initialized.');
  if (usesLegacyWorkdocsDir) {
    console.log('[warn] Detected legacy release/workdocs/. Consider renaming to release/handbook/.');
  }
  for (const a of actions) {
    const modeStr = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${modeStr}${reason}`);
  }
}

function cmdStatus(repoRoot, format) {
  const config = loadConfig(repoRoot);
  const initialized = fs.existsSync(getReleaseDir(repoRoot));

  const status = {
    initialized,
    strategy: config.strategy,
    currentVersion: config.currentVersion,
    changelog: config.changelog,
    updatedAt: config.updatedAt,
    history: Array.isArray(config.history) ? config.history.length : 0
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Release Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Strategy: ${status.strategy}`);
  console.log(`  Current version: ${status.currentVersion || '(none)'}`);
  console.log(`  Changelog: ${status.changelog ? 'enabled' : 'disabled'}`);
  console.log(`  Updated at: ${status.updatedAt || 'never'}`);
  console.log(`  History entries: ${status.history}`);
}

function cmdPrepare(repoRoot, version) {
  const config = loadConfig(repoRoot);
  const { ok, value, error } = validateVersion(config.strategy, version);
  if (!ok) die(`[error] ${error}`);

  const v = value;
  config.currentVersion = v;

  const history = Array.isArray(config.history) ? config.history : [];
  history.push({ version: v, preparedAt: nowIso(), status: 'prepared' });
  config.history = history;
  saveConfig(repoRoot, config);

  console.log(`[ok] Prepared release: ${v}`);
  console.log('\nNext steps (human-executed):');
  console.log('  1. Update release/CHANGELOG.md (use release/changelog-template.md as reference)');
  console.log('  2. Run tests and verify artifacts');
  console.log(`  3. Tag when ready: node .ai/skills/features/release/scripts/ctl-release.mjs tag --version ${v}`);
}

function cmdChangelog(repoRoot, from, to) {
  const config = loadConfig(repoRoot);
  const currentVersion = config.currentVersion || '(unknown)';
  const rootChangelog = path.relative(repoRoot, getRootChangelogPath(repoRoot));
  const template = path.relative(repoRoot, getChangelogTemplatePath(repoRoot));

  console.log('Changelog Guidance');
  console.log('----------------------------------------');
  console.log(`Current version: ${currentVersion}`);
  console.log(`Template: ${template}`);
  console.log(`Changelog file: ${rootChangelog}`);
  console.log('----------------------------------------\n');

  console.log('Suggested steps (human-executed):');
  console.log(`1) Collect changes since ${from || '(last tag)'} until ${to || 'HEAD'}`);
  console.log('2) Summarize into Keep-a-Changelog categories: Added/Changed/Fixed/Security/etc');
  console.log(`3) Update ${rootChangelog}`);
  console.log('');
  console.log('Example git commands:');
  console.log(`  git log ${from || '<last-tag>'}..${to || 'HEAD'} --oneline`);
  console.log(`  git log ${from || '<last-tag>'}..${to || 'HEAD'} --merges --oneline`);
}

function cmdTag(repoRoot, version) {
  const config = loadConfig(repoRoot);
  const v = version ? String(version).trim() : String(config.currentVersion || '').trim();
  if (!v) die('[error] --version is required (or set currentVersion via prepare)');

  const { ok, error } = validateVersion(config.strategy, v);
  if (!ok) die(`[error] ${error}`);

  const tag = `v${v}`;
  console.log('Tag Guidance (human-executed)');
  console.log('----------------------------------------');
  console.log(`Tag: ${tag}`);
  console.log('----------------------------------------\n');

  console.log('Commands:');
  console.log(`  git tag -a ${tag} -m "Release ${tag}"`);
  console.log(`  git push origin ${tag}`);
  console.log('');
  console.log('Notes:');
  console.log('  - Ensure release/CHANGELOG.md is updated and committed before tagging.');
  console.log('  - If using semantic-release, prefer CI-driven tagging.');
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  const releaseDir = getReleaseDir(repoRoot);
  if (!fs.existsSync(releaseDir)) {
    errors.push('release/ not found. Run: ctl-release init');
  }

  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath)) {
    errors.push('release/config.json not found. Run: ctl-release init');
  }

  const config = loadConfig(repoRoot);
  if (!VALID_STRATEGIES.has(config.strategy)) {
    errors.push(`Invalid strategy: ${config.strategy}`);
  }

  if (config.changelog) {
    const changelogPath = getRootChangelogPath(repoRoot);
    if (!fs.existsSync(changelogPath)) {
      warnings.push('release/CHANGELOG.md is missing (changelog enabled)');
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
  console.log(ok ? '[ok] Release configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
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
      cmdInit(repoRoot, !!opts['dry-run'], opts['strategy']);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    case 'prepare':
      cmdPrepare(repoRoot, opts['version']);
      break;
    case 'changelog':
      cmdChangelog(repoRoot, opts['from'], opts['to']);
      break;
    case 'tag':
      cmdTag(repoRoot, opts['version']);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
