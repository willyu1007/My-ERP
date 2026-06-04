#!/usr/bin/env node
/**
 * ctl-ci.mjs
 *
 * CI configuration helper for the CI feature.
 *
 * Commands:
 *   init              Initialize CI configuration (idempotent)
 *   add-delivery       Install opt-in delivery workflow templates
 *   verify            Verify CI configuration
 *   status            Show current CI status
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CLI Argument Parsing
// ============================================================================

const SUPPORTED_PROVIDERS = ['github', 'gitlab'];

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/ci/scripts/ctl-ci.mjs <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --provider <github|gitlab>  CI provider to configure (copies starter template)
    --dry-run                   Show what would be created
    Initialize CI configuration skeleton.

  add-delivery
    --repo-root <path>          Repo root (default: cwd)
    --provider <github|gitlab>  Provider to install delivery templates for (required)
    --dry-run                   Show what would be changed
    Install opt-in delivery workflow templates (non-destructive).

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify CI configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show current CI status.

Examples:
  node .ai/skills/features/ci/scripts/ctl-ci.mjs init
  node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider github
  node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider gitlab
  node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github
  node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab
  node .ai/skills/features/ci/scripts/ctl-ci.mjs verify
  node .ai/skills/features/ci/scripts/ctl-ci.mjs status
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
// CI Management
// ============================================================================

function getCiDir(repoRoot) {
  return path.join(repoRoot, 'ci');
}

function resolveHandbookDir(baseDir) {
  const handbookDir = path.join(baseDir, 'handbook');
  const legacyWorkdocsDir = path.join(baseDir, 'workdocs');

  if (fs.existsSync(handbookDir)) return { dir: handbookDir, legacy: false };
  if (fs.existsSync(legacyWorkdocsDir)) return { dir: legacyWorkdocsDir, legacy: true };
  return { dir: handbookDir, legacy: false };
}

function getConfigPath(repoRoot) {
  return path.join(getCiDir(repoRoot), 'config.json');
}

function getSharedVerifyScriptPath(repoRoot) {
  return path.join(repoRoot, '.ai', 'skills', 'features', 'ci', 'scripts', 'ci-verify.mjs');
}

function loadConfig(repoRoot) {
  return readJson(getConfigPath(repoRoot)) || {
    version: 1,
    provider: null
  };
}

function saveConfig(repoRoot, config) {
  writeJson(getConfigPath(repoRoot), config);
}

// ============================================================================
// Provider Template Paths
// ============================================================================

function getSkillTemplatePath(provider) {
  // __dirname is .ai/skills/features/ci/scripts/, so we go up to feature root.
  const featureRoot = path.join(__dirname, '..');
  if (provider === 'github') {
    return path.join(featureRoot, 'github-actions-ci', 'reference', 'templates', 'github-actions', 'ci.yml');
  } else if (provider === 'gitlab') {
    return path.join(featureRoot, 'gitlab-ci', 'reference', 'templates', 'gitlab-ci', '.gitlab-ci.yml');
  }
  return null;
}

function getProviderDestPath(repoRoot, provider) {
  if (provider === 'github') {
    return path.join(repoRoot, '.github', 'workflows', 'ci.yml');
  } else if (provider === 'gitlab') {
    return path.join(repoRoot, '.gitlab-ci.yml');
  }
  return null;
}

function getDeliveryTemplatePath(provider) {
  const featureRoot = path.join(__dirname, '..');
  if (provider === 'github') {
    return path.join(featureRoot, 'github-actions-ci', 'reference', 'templates', 'github-actions', 'delivery.yml');
  } else if (provider === 'gitlab') {
    return path.join(featureRoot, 'gitlab-ci', 'reference', 'templates', 'gitlab-ci', 'delivery.yml');
  }
  return null;
}

function getDeliveryDestPath(repoRoot, provider) {
  if (provider === 'github') {
    return path.join(repoRoot, '.github', 'workflows', 'delivery.yml');
  }
  if (provider === 'gitlab') {
    return path.join(repoRoot, '.gitlab-ci.yml');
  }
  return null;
}

function copyProviderTemplate(repoRoot, provider, dryRun) {
  const srcPath = getSkillTemplatePath(provider);
  const destPath = getProviderDestPath(repoRoot, provider);

  if (!srcPath || !destPath) {
    return { op: 'skip', path: destPath, reason: 'unknown provider' };
  }

  if (!fs.existsSync(srcPath)) {
    return { op: 'skip', path: destPath, reason: `template not found: ${srcPath}` };
  }

  if (fs.existsSync(destPath)) {
    return { op: 'skip', path: destPath, reason: 'exists' };
  }

  if (dryRun) {
    return { op: 'copy', path: destPath, from: srcPath, mode: 'dry-run' };
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { op: 'copy', path: destPath, from: srcPath };
}

function copyDeliveryTemplateGithub(repoRoot, dryRun) {
  const srcPath = getDeliveryTemplatePath('github');
  const destPath = getDeliveryDestPath(repoRoot, 'github');

  if (!srcPath || !destPath) {
    return { op: 'skip', path: destPath, reason: 'unknown provider' };
  }

  if (!fs.existsSync(srcPath)) {
    return { op: 'skip', path: destPath, reason: `template not found: ${srcPath}` };
  }

  if (fs.existsSync(destPath)) {
    return { op: 'skip', path: destPath, reason: 'exists' };
  }

  if (dryRun) {
    return { op: 'copy', path: destPath, from: srcPath, mode: 'dry-run' };
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { op: 'copy', path: destPath, from: srcPath };
}

function upsertGitlabManagedBlock(filePath, beginMarker, endMarker, blockBody, dryRun) {
  const exists = fs.existsSync(filePath);
  if (!exists) {
    return { op: 'skip', path: filePath, reason: 'missing (run CI init first)' };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.includes(beginMarker) && raw.includes(endMarker)) {
    return { op: 'skip', path: filePath, reason: 'delivery block already installed' };
  }

  const next = `${raw.trimEnd()}\n\n${beginMarker}\n${blockBody.trimEnd()}\n${endMarker}\n`;
  if (dryRun) {
    return { op: 'edit', path: filePath, mode: 'dry-run', note: 'append delivery managed block' };
  }

  fs.writeFileSync(filePath, next, 'utf8');
  return { op: 'edit', path: filePath, note: 'appended delivery managed block' };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, provider, dryRun) {
  const ciDir = getCiDir(repoRoot);
  const { dir: handbookDir, legacy: usesLegacyWorkdocsDir } = resolveHandbookDir(ciDir);
  const actions = [];

  // Validate provider if specified
  if (provider && !SUPPORTED_PROVIDERS.includes(provider)) {
    die(`[error] Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  // Create directories
  const dirs = [ciDir, handbookDir];
  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create config
  const configPath = getConfigPath(repoRoot);
  const existingConfig = readJson(configPath);
  const newConfig = {
    version: 1,
    provider: provider || (existingConfig ? existingConfig.provider : null)
  };

  if (!fs.existsSync(configPath)) {
    if (!dryRun) {
      saveConfig(repoRoot, newConfig);
      actions.push({ op: 'write', path: configPath });
    } else {
      actions.push({ op: 'write', path: configPath, mode: 'dry-run' });
    }
  } else if (provider && existingConfig && existingConfig.provider !== provider) {
    // Update provider if explicitly specified and different
    if (!dryRun) {
      saveConfig(repoRoot, newConfig);
      actions.push({ op: 'update', path: configPath, note: `provider: ${provider}` });
    } else {
      actions.push({ op: 'update', path: configPath, note: `provider: ${provider}`, mode: 'dry-run' });
    }
  } else {
    actions.push({ op: 'skip', path: configPath, reason: 'exists' });
  }

  // Create AGENTS.md
  const agentsPath = path.join(ciDir, 'AGENTS.md');
  const agentsContent = `# CI Configuration (LLM-first)

## Commands

\`\`\`bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs init
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider github
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider gitlab
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab
node .ai/skills/features/ci/scripts/ctl-ci.mjs verify
node .ai/skills/features/ci/scripts/ctl-ci.mjs status
\`\`\`

## Guidelines

- Track CI metadata in \`ci/config.json\`.
- Edit provider files directly (e.g., \`.github/workflows/\`, \`.gitlab-ci.yml\`).
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  // Copy provider template if specified
  if (provider) {
    actions.push(copyProviderTemplate(repoRoot, provider, dryRun));
  }

  console.log('[ok] CI configuration initialized.');
  if (usesLegacyWorkdocsDir) {
    console.log('[warn] Detected legacy ci/workdocs/. Consider renaming to ci/handbook/.');
  }
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    const note = a.note ? ` (${a.note})` : '';
    const from = a.from ? ` <- ${path.relative(repoRoot, a.from)}` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${from}${note}${mode}${reason}`);
  }
}

function cmdAddDelivery(repoRoot, provider, dryRun) {
  const actions = [];

  if (!provider) {
    die('[error] Missing --provider. Use: add-delivery --provider <github|gitlab>');
  }
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    die(`[error] Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  if (provider === 'github') {
    actions.push(copyDeliveryTemplateGithub(repoRoot, dryRun));
  } else if (provider === 'gitlab') {
    const destPath = getDeliveryDestPath(repoRoot, 'gitlab');
    const srcPath = getDeliveryTemplatePath('gitlab');
    if (!fs.existsSync(srcPath)) {
      actions.push({ op: 'skip', path: destPath, reason: `template not found: ${srcPath}` });
    } else {
      const block = fs.readFileSync(srcPath, 'utf8');
      const begin = '# --- BEGIN DELIVERY (generated by ctl-ci) ---';
      const end = '# --- END DELIVERY (generated by ctl-ci) ---';
      actions.push(upsertGitlabManagedBlock(destPath, begin, end, block, dryRun));
    }
  }

  console.log('[ok] Delivery templates processed.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    const note = a.note ? ` (${a.note})` : '';
    const from = a.from ? ` <- ${path.relative(repoRoot, a.from)}` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${from}${note}${mode}${reason}`);
  }
}

function cmdVerify(repoRoot) {
  const config = loadConfig(repoRoot);
  const errors = [];
  const warnings = [];
  const sharedVerifyPattern = /node\s+["']?\.ai\/skills\/features\/ci\/scripts\/ci-verify\.mjs["']?/;

  if (!config.provider) {
    warnings.push('No CI provider configured. Run: ctl-ci init --provider <github|gitlab>');
  }

  if (!fs.existsSync(getCiDir(repoRoot))) {
    errors.push('ci/ directory not found. Run: ctl-ci init');
  }
  if (!fs.existsSync(getConfigPath(repoRoot))) {
    errors.push('ci/config.json not found. Run: ctl-ci init');
  }

  const sharedVerifyScriptPath = getSharedVerifyScriptPath(repoRoot);
  if (!fs.existsSync(sharedVerifyScriptPath)) {
    warnings.push('.ai/skills/features/ci/scripts/ci-verify.mjs not found. CI templates should call the shared verifier.');
  }

  // Check provider-specific files
  if (config.provider === 'github') {
    const workflowDir = path.join(repoRoot, '.github', 'workflows');
    if (!fs.existsSync(workflowDir)) {
      warnings.push('.github/workflows/ directory not found. Run: ctl-ci init --provider github');
    } else {
      const workflows = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      if (workflows.length === 0) {
        warnings.push('No workflow files found in .github/workflows/');
      } else {
        let usesSharedVerify = false;
        for (const wf of workflows) {
          const wfPath = path.join(workflowDir, wf);
          const raw = fs.readFileSync(wfPath, 'utf8');
          if (sharedVerifyPattern.test(raw)) {
            usesSharedVerify = true;
            break;
          }
        }
        if (!usesSharedVerify) {
          warnings.push('No GitHub workflow calls "node .ai/skills/features/ci/scripts/ci-verify.mjs". Ensure CI checks use the shared verifier entrypoint.');
        }
      }
    }
  } else if (config.provider === 'gitlab') {
    const gitlabCi = path.join(repoRoot, '.gitlab-ci.yml');
    if (!fs.existsSync(gitlabCi)) {
      warnings.push('.gitlab-ci.yml not found. Run: ctl-ci init --provider gitlab');
    } else {
      const raw = fs.readFileSync(gitlabCi, 'utf8');
      if (!sharedVerifyPattern.test(raw)) {
        warnings.push('.gitlab-ci.yml does not call "node .ai/skills/features/ci/scripts/ci-verify.mjs". Ensure CI checks use the shared verifier entrypoint.');
      }
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
  console.log(ok ? '[ok] CI configuration verified.' : '[error] CI verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdStatus(repoRoot, format) {
  const config = loadConfig(repoRoot);
  const status = {
    initialized: fs.existsSync(getCiDir(repoRoot)),
    provider: config.provider
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('CI Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Provider: ${status.provider || '(none)'}`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();
  const provider = opts['provider'] ? opts['provider'].toLowerCase() : null;

  switch (command) {
    case 'init':
      cmdInit(repoRoot, provider, !!opts['dry-run']);
      break;
    case 'add-delivery':
      cmdAddDelivery(repoRoot, provider, !!opts['dry-run']);
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
