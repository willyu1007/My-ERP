#!/usr/bin/env node
/**
 * ctl-skill-packs.mjs
 *
 * Skill packs controller (packs state + `.ai/skills/_meta/*` + wrapper sync).
 * This is the "scheme A" controller for pack-based skill management.
 *
 * Commands:
 *   status            Show current skills configuration
 *   enable-pack       Enable a skill pack
 *   disable-pack      Disable a skill pack
 *   list-packs        List available packs
 *   sync              Synchronize provider wrappers
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/_meta/ctl-skill-packs.mjs <command> [options]

Commands:
  help
    Show this help.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show current skills configuration.

  enable-pack <pack-name>
    --repo-root <path>          Repo root (default: cwd)
    --providers <both|codex|claude>  Provider targets (default: both)
    --no-sync                   Don't run sync after enabling
    Enable a skill pack.

  disable-pack <pack-name>
    --repo-root <path>          Repo root (default: cwd)
    --providers <both|codex|claude>  Provider targets (default: both)
    --no-sync                   Don't run sync after disabling
    Disable a skill pack.

  list-packs
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List available packs.

  sync
    --repo-root <path>          Repo root (default: cwd)
    --providers <both|codex|claude>  Provider targets (default: both)
    --sync-mode <update|reset>  sync-skills mode (default: update)
    --yes                       Allow destructive sync (required for reset)
    Synchronize provider wrappers.

Examples:
  node .ai/skills/_meta/ctl-skill-packs.mjs status
  node .ai/skills/_meta/ctl-skill-packs.mjs enable-pack backend --providers both
  node .ai/skills/_meta/ctl-skill-packs.mjs disable-pack frontend
  node .ai/skills/_meta/ctl-skill-packs.mjs list-packs
  node .ai/skills/_meta/ctl-skill-packs.mjs sync --providers both
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
// Skills Management
// ============================================================================

function getSkillsMetaDir(repoRoot) {
  return path.join(repoRoot, '.ai', 'skills', '_meta');
}

function getPacksDir(repoRoot) {
  return path.join(getSkillsMetaDir(repoRoot), 'packs');
}

function getManifestPath(repoRoot) {
  return path.join(getSkillsMetaDir(repoRoot), 'sync-manifest.json');
}

function getStatePath(repoRoot) {
  return path.join(getSkillsMetaDir(repoRoot), 'skillsctl-state.json');
}

function loadManifest(repoRoot) {
  const manifestPath = getManifestPath(repoRoot);
  const data = readJson(manifestPath);
  if (!data) {
    return {
      version: 1,
      includePrefixes: [],
      includeSkills: [],
      excludeSkills: []
    };
  }
  return data;
}

function saveManifest(repoRoot, manifest) {
  writeJson(getManifestPath(repoRoot), manifest);
}

function loadState(repoRoot) {
  const statePath = getStatePath(repoRoot);
  const data = readJson(statePath);
  if (!data) {
    return {
      version: 1,
      enabledPacks: [],
      lastSync: null
    };
  }
  return data;
}

function saveState(repoRoot, state) {
  writeJson(getStatePath(repoRoot), state);
}

function listAvailablePacks(repoRoot) {
  const packsDir = getPacksDir(repoRoot);
  if (!fs.existsSync(packsDir)) {
    return [];
  }

  const files = fs.readdirSync(packsDir);
  const packs = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const packPath = path.join(packsDir, file);
    const packData = readJson(packPath);
    if (packData && packData.id) {
      packs.push({
        id: packData.id,
        version: packData.version || '0.0.0',
        description: packData.description || '',
        includePrefixes: packData.includePrefixes || [],
        file: file
      });
    }
  }

  return packs;
}

function getPackInfo(repoRoot, packId) {
  const packPath = path.join(getPacksDir(repoRoot), `${packId}.json`);
  return readJson(packPath);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

// ============================================================================
// Sync Helper
// ============================================================================

function runSync(repoRoot, providers, syncMode, yes) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(repoRoot, '.ai', 'scripts', 'sync-skills.mjs');
    if (!fs.existsSync(scriptPath)) {
      console.warn('[warn] sync-skills.mjs not found, skipping sync');
      resolve(false);
      return;
    }

    const mode = (syncMode || 'update').toLowerCase();
    if (!['update', 'reset'].includes(mode)) {
      reject(new Error(`Invalid --sync-mode: ${syncMode}`));
      return;
    }

    const args = ['--scope', 'current', '--providers', providers, '--mode', mode];
    if (mode === 'reset' && yes) args.push('--yes');
    console.log(`[info] Running: node ${path.relative(repoRoot, scriptPath)} ${args.join(' ')}`);

    const child = spawn('node', [scriptPath, ...args], {
      cwd: repoRoot,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`sync-skills exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================================================
// Commands
// ============================================================================

function cmdStatus(repoRoot, format) {
  const manifest = loadManifest(repoRoot);
  const state = loadState(repoRoot);
  const packs = listAvailablePacks(repoRoot);

  const status = {
    manifest: {
      path: path.relative(repoRoot, getManifestPath(repoRoot)),
      includePrefixes: manifest.includePrefixes,
      includeSkills: manifest.includeSkills,
      excludeSkills: manifest.excludeSkills
    },
    state: {
      enabledPacks: state.enabledPacks,
      lastSync: state.lastSync
    },
    availablePacks: packs.map(p => p.id)
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Skills Configuration Status:');
  console.log('');
  console.log('  Manifest:');
  console.log(`    File: ${status.manifest.path}`);
  console.log(`    Include prefixes: ${status.manifest.includePrefixes.join(', ') || '(none)'}`);
  console.log(`    Include skills: ${status.manifest.includeSkills.length} specific`);
  console.log(`    Exclude skills: ${status.manifest.excludeSkills.length} excluded`);
  console.log('');
  console.log('  State:');
  console.log(`    Enabled packs: ${status.state.enabledPacks.join(', ') || '(none)'}`);
  console.log(`    Last sync: ${status.state.lastSync || 'never'}`);
  console.log('');
  console.log('  Available packs:');
  for (const pack of packs) {
    const enabled = state.enabledPacks.includes(pack.id) ? '[enabled]' : '';
    console.log(`    - ${pack.id} ${enabled}`);
    if (pack.description) {
      console.log(`      ${pack.description}`);
    }
  }
}

async function cmdEnablePack(repoRoot, packId, providers, noSync, syncMode, yes) {
  if (!packId) die('[error] Pack name is required');

  const packInfo = getPackInfo(repoRoot, packId);
  if (!packInfo) {
    die(`[error] Pack "${packId}" not found. Run: node .ai/skills/_meta/ctl-skill-packs.mjs list-packs`);
  }

  const manifest = loadManifest(repoRoot);
  const state = loadState(repoRoot);

  // Add prefixes from pack to manifest
  const newPrefixes = packInfo.includePrefixes || [];
  manifest.includePrefixes = uniq([...manifest.includePrefixes, ...newPrefixes]);

  // Add pack to enabled list
  if (!state.enabledPacks.includes(packId)) {
    state.enabledPacks.push(packId);
  }

  saveManifest(repoRoot, manifest);
  saveState(repoRoot, state);

  console.log(`[ok] Enabled pack: ${packId}`);
  console.log(`     Added prefixes: ${newPrefixes.join(', ') || '(none)'}`);

  // Run sync unless --no-sync
  if (!noSync) {
    try {
      await runSync(repoRoot, providers, syncMode, yes);
      state.lastSync = new Date().toISOString();
      saveState(repoRoot, state);
    } catch (err) {
      console.error(`[error] Sync failed: ${err.message}`);
      process.exit(1);
    }
  }
}

async function cmdDisablePack(repoRoot, packId, providers, noSync, syncMode, yes) {
  if (!packId) die('[error] Pack name is required');

  const packInfo = getPackInfo(repoRoot, packId);
  if (!packInfo) {
    die(`[error] Pack "${packId}" not found. Run: node .ai/skills/_meta/ctl-skill-packs.mjs list-packs`);
  }

  const manifest = loadManifest(repoRoot);
  const state = loadState(repoRoot);

  // Remove prefixes that are only from this pack
  const packPrefixes = packInfo.includePrefixes || [];
  
  // Get prefixes from all other enabled packs
  const otherPrefixes = new Set();
  for (const otherPackId of state.enabledPacks) {
    if (otherPackId === packId) continue;
    const otherPack = getPackInfo(repoRoot, otherPackId);
    if (otherPack && otherPack.includePrefixes) {
      for (const prefix of otherPack.includePrefixes) {
        otherPrefixes.add(prefix);
      }
    }
  }

  // Only remove prefixes that aren't used by other packs
  const prefixesToRemove = packPrefixes.filter(p => !otherPrefixes.has(p));
  manifest.includePrefixes = manifest.includePrefixes.filter(p => !prefixesToRemove.includes(p));

  // Remove pack from enabled list
  state.enabledPacks = state.enabledPacks.filter(p => p !== packId);

  saveManifest(repoRoot, manifest);
  saveState(repoRoot, state);

  console.log(`[ok] Disabled pack: ${packId}`);
  console.log(`     Removed prefixes: ${prefixesToRemove.join(', ') || '(none)'}`);

  // Run sync unless --no-sync
  if (!noSync) {
    try {
      await runSync(repoRoot, providers, syncMode, yes);
      state.lastSync = new Date().toISOString();
      saveState(repoRoot, state);
    } catch (err) {
      console.error(`[error] Sync failed: ${err.message}`);
      process.exit(1);
    }
  }
}

function cmdListPacks(repoRoot, format) {
  const packs = listAvailablePacks(repoRoot);
  const state = loadState(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify({
      packs: packs.map(p => ({
        ...p,
        enabled: state.enabledPacks.includes(p.id)
      }))
    }, null, 2));
    return;
  }

  if (packs.length === 0) {
    console.log('No packs found in .ai/skills/_meta/packs/');
    return;
  }

  console.log(`Available Packs (${packs.length} total):\n`);
  for (const pack of packs) {
    const enabled = state.enabledPacks.includes(pack.id) ? ' [enabled]' : '';
    console.log(`  ${pack.id}${enabled}`);
    console.log(`    Version: ${pack.version}`);
    if (pack.description) {
      console.log(`    Description: ${pack.description}`);
    }
    console.log(`    Prefixes: ${pack.includePrefixes.join(', ') || '(none)'}`);
    console.log('');
  }
}

async function cmdSync(repoRoot, providers, syncMode, yes) {
  const state = loadState(repoRoot);

  try {
    await runSync(repoRoot, providers, syncMode, yes);
    state.lastSync = new Date().toISOString();
    saveState(repoRoot, state);
    console.log('[ok] Sync completed.');
  } catch (err) {
    console.error(`[error] Sync failed: ${err.message}`);
    process.exit(1);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { command, opts, positionals } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();
  const providers = opts['providers'] || 'both';
  const noSync = !!opts['no-sync'];
  const syncMode = opts['sync-mode'] || 'update';
  const yes = !!opts['yes'];

  switch (command) {
    case 'help':
      usage(0);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    case 'enable-pack':
      await cmdEnablePack(repoRoot, positionals[0], providers, noSync, syncMode, yes);
      break;
    case 'disable-pack':
      await cmdDisablePack(repoRoot, positionals[0], providers, noSync, syncMode, yes);
      break;
    case 'list-packs':
      cmdListPacks(repoRoot, format);
      break;
    case 'sync':
      await cmdSync(repoRoot, providers, syncMode, yes);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main().catch(err => {
  console.error(`[fatal] ${err.message}`);
  process.exit(1);
});
