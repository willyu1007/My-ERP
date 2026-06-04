#!/usr/bin/env node
/**
 * ctl-project-state.mjs
 *
 * Project state and configuration management for the Context Awareness feature.
 *
 * Commands:
 *   init              Initialize project state (idempotent)
 *   get               Get a project state value
 *   set               Set a project state value
 *   set-context-mode  Set context mode (contract|snapshot)
 *   status            Show project status
 *   verify            Verify project state consistency
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/ctl-project-state.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created without writing
    Initialize project state (idempotent).

  get <key>
    --repo-root <path>          Repo root (default: cwd)
    Get a project state value.

  set <key> <value>
    --repo-root <path>          Repo root (default: cwd)
    Set a project state value.

  set-context-mode <contract|snapshot>
    --repo-root <path>          Repo root (default: cwd)
    Set context mode.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show project status.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify project state consistency.

Examples:
  node .ai/scripts/ctl-project-state.mjs init
  node .ai/scripts/ctl-project-state.mjs set-context-mode contract
  node .ai/scripts/ctl-project-state.mjs status
  node .ai/scripts/ctl-project-state.mjs get context.mode
  node .ai/scripts/ctl-project-state.mjs set custom.project.version 1.0.0
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
  const positionals = [];

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
    } else {
      positionals.push(token);
    }
  }

  return { command, opts, positionals };
}

// ============================================================================
// File Utilities
// ============================================================================

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ============================================================================
// Project State Management
// ============================================================================

function normalizeState(raw) {
  const now = new Date().toISOString();
  const state = raw && typeof raw === 'object' ? raw : {};

  const createdAt = state.createdAt || now;
  const updatedAt = state.updatedAt || state.lastUpdated || now;

  const mode = String(state.context?.mode || 'contract').toLowerCase() === 'snapshot'
    ? 'snapshot'
    : 'contract';
  const enabled = state.context?.enabled !== undefined ? !!state.context.enabled : false;

  const features = (state.features && typeof state.features === 'object' && !Array.isArray(state.features))
    ? state.features
    : {};
  const custom = (state.custom && typeof state.custom === 'object' && !Array.isArray(state.custom))
    ? { ...state.custom }
    : {};

  // Preserve unknown/legacy top-level keys under custom to keep the root schema valid.
  const allowedTopKeys = new Set(['version', 'createdAt', 'updatedAt', 'lastUpdated', 'context', 'features', 'custom']);
  for (const [k, v] of Object.entries(state)) {
    if (allowedTopKeys.has(k)) continue;
    if (custom[k] === undefined) custom[k] = v;
  }

  const legacyContextInitialized = state.context?.initialized;
  if (legacyContextInitialized !== undefined && custom.contextInitialized === undefined) {
    custom.contextInitialized = legacyContextInitialized;
  }

  return {
    version: 1,
    createdAt,
    updatedAt,
    context: { mode, enabled },
    features,
    custom
  };
}

function getProjectDir(repoRoot) {
  return path.join(repoRoot, '.ai', 'project');
}

function getStatePath(repoRoot) {
  return path.join(getProjectDir(repoRoot), 'state.json');
}

function loadState(repoRoot) {
  const statePath = getStatePath(repoRoot);
  const data = readJson(statePath);
  return normalizeState(data);
}

function saveState(repoRoot, state) {
  const normalized = normalizeState(state);
  normalized.updatedAt = new Date().toISOString();
  writeJson(getStatePath(repoRoot), normalized);
}

function createDefaultState() {
  return normalizeState(null);
}

function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === null || current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function isAllowedSetKey(keyPath) {
  if (!keyPath) return false;
  if (keyPath === 'context.mode') return true;
  if (keyPath === 'context.enabled') return true;
  if (keyPath.startsWith('features.')) return true;
  if (keyPath.startsWith('custom.')) return true;
  return false;
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const projectDir = getProjectDir(repoRoot);
  const statePath = getStatePath(repoRoot);
  const schemaPath = path.join(projectDir, 'state.schema.json');

  const actions = [];

  // Create project directory
  if (!fs.existsSync(projectDir)) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: projectDir, mode: 'dry-run' });
    } else {
      fs.mkdirSync(projectDir, { recursive: true });
      actions.push({ op: 'mkdir', path: projectDir });
    }
  }

  // Create state file
  if (!fs.existsSync(statePath)) {
    if (dryRun) {
      actions.push({ op: 'write', path: statePath, mode: 'dry-run' });
    } else {
      const state = createDefaultState();
      saveState(repoRoot, state);
      actions.push({ op: 'write', path: statePath });
    }
  } else {
    // Normalize existing state to current schema (idempotent)
    if (!dryRun) {
      const before = readJson(statePath);
      const after = normalizeState(before);
      after.updatedAt = new Date().toISOString();
      writeJson(statePath, after);
      actions.push({ op: 'update', path: statePath, note: 'normalized to schema' });
    }
  }

  // Create schema file
  const schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Project State",
    "type": "object",
    "additionalProperties": false,
    "required": ["version", "createdAt", "updatedAt", "context"],
    "properties": {
      "version": { "type": "integer", "const": 1 },
      "createdAt": { "type": "string", "description": "ISO 8601 timestamp" },
      "updatedAt": { "type": "string", "description": "ISO 8601 timestamp" },
      "context": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "mode": { "type": "string", "enum": ["contract", "snapshot"] },
          "enabled": { "type": "boolean" }
        }
      },
      "features": {
        "type": "object",
        "description": "Feature flags or enabled capabilities",
        "additionalProperties": { "type": "boolean" }
      },
      "custom": {
        "type": "object",
        "description": "Custom project-specific state",
        "additionalProperties": true
      }
    }
  };

  if (!fs.existsSync(schemaPath)) {
    if (dryRun) {
      actions.push({ op: 'write', path: schemaPath, mode: 'dry-run' });
    } else {
      writeJson(schemaPath, schema);
      actions.push({ op: 'write', path: schemaPath });
    }
  } else {
    actions.push({ op: 'skip', path: schemaPath, reason: 'exists' });
  }

  console.log('[ok] Project state initialized.');
  for (const action of actions) {
    const mode = action.mode ? ` (${action.mode})` : '';
    const reason = action.reason ? ` [${action.reason}]` : '';
    const note = action.note ? ` (${action.note})` : '';
    console.log(`  ${action.op}: ${path.relative(repoRoot, action.path)}${mode}${reason}${note}`);
  }
}

function cmdGet(repoRoot, key) {
  if (!key) die('[error] Key is required');

  const state = loadState(repoRoot);
  const value = getNestedValue(state, key);

  if (value === undefined) {
    console.log(`(undefined)`);
  } else if (typeof value === 'object') {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(value);
  }
}

function cmdSet(repoRoot, key, value) {
  if (!key) die('[error] Key is required');
  if (value === undefined) die('[error] Value is required');
  if (!isAllowedSetKey(key)) {
    die('[error] Unsupported key path. Allowed: context.mode, context.enabled, features.<flag>, custom.<path>');
  }

  const state = loadState(repoRoot);

  // Try to parse value as JSON, otherwise use as string
  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }

  setNestedValue(state, key, parsedValue);
  saveState(repoRoot, state);

  console.log(`[ok] Set ${key} = ${JSON.stringify(parsedValue)}`);
}

function cmdSetContextMode(repoRoot, mode) {
  const validModes = ['contract', 'snapshot'];
  if (!mode || !validModes.includes(mode)) {
    die(`[error] Mode must be one of: ${validModes.join(', ')}`);
  }

  const state = loadState(repoRoot);
  const oldMode = state.context?.mode;
  state.context = state.context || {};
  state.context.mode = mode;
  saveState(repoRoot, state);

  console.log(`[ok] Context mode set to: ${mode}${oldMode ? ` (was: ${oldMode})` : ''}`);
}

function cmdStatus(repoRoot, format) {
  const state = loadState(repoRoot);
  const statePath = getStatePath(repoRoot);
  const stateExists = fs.existsSync(statePath);

  if (format === 'json') {
    console.log(JSON.stringify({
      initialized: stateExists,
      state
    }, null, 2));
    return;
  }

  console.log('Project State:');
  console.log(`  Initialized: ${stateExists ? 'yes' : 'no'}`);
  console.log(`  State file: ${path.relative(repoRoot, statePath)}`);
  console.log('');
  console.log('  Context:');
  console.log(`    Mode: ${state.context?.mode || 'not set'}`);
  console.log(`    Enabled: ${state.context?.enabled ? 'yes' : 'no'}`);
  console.log('');
  const featureKeys = Object.entries(state.features || {}).filter(([, v]) => !!v).map(([k]) => k);
  console.log(`  Features enabled: ${featureKeys.length > 0 ? featureKeys.join(', ') : '(none)'}`);
  console.log('');
  console.log(`  Updated at: ${state.updatedAt || 'unknown'}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  const statePath = getStatePath(repoRoot);
  
  // Check state file exists
  if (!fs.existsSync(statePath)) {
    errors.push('Project state file does not exist. Run: projectctl init');
  } else {
    const state = loadState(repoRoot);

    // Check required fields
    if (!state.version) {
      errors.push('state.version is missing');
    }

    if (!state.context) {
      errors.push('state.context is missing');
    } else {
      if (!state.context.mode) {
        warnings.push('state.context.mode is not set');
      }
      if (state.context.enabled !== true) warnings.push('state.context.enabled is false');
    }
  }

  // Report results
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const ok = errors.length === 0;
  if (ok) {
    console.log('[ok] Project state verification passed.');
  } else {
    console.log('[error] Project state verification failed.');
    process.exit(1);
  }
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts, positionals } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();

  switch (command) {
    case 'help':
      usage(0);
      break;
    case 'init':
      cmdInit(repoRoot, !!opts['dry-run']);
      break;
    case 'get':
      cmdGet(repoRoot, positionals[0]);
      break;
    case 'set':
      cmdSet(repoRoot, positionals[0], positionals[1]);
      break;
    case 'set-context-mode':
      cmdSetContextMode(repoRoot, positionals[0]);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
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
