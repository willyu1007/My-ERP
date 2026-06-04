#!/usr/bin/env node
/**
 * install.mjs
 *
 * Install or uninstall Git hooks from .githooks/ directory.
 *
 * Usage:
 *   node .githooks/install.mjs [--uninstall] [--check]
 *
 * Options:
 *   --uninstall  Remove hooks configuration
 *   --check      Check if hooks are installed (exit 0 if yes, 1 if no)
 *
 * Design notes:
 *   - Dependency-free (Node built-ins only).
 *   - Uses Git's core.hooksPath to point to .githooks/
 *   - Does not copy hooks into .git/hooks/ (avoids permission issues)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal output
const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function getHooksPath() {
  try {
    return execSync('git config --get core.hooksPath', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function setHooksPath(hooksDir) {
  execSync(`git config core.hooksPath "${hooksDir}"`, { encoding: 'utf8' });
}

function unsetHooksPath() {
  try {
    execSync('git config --unset core.hooksPath', { encoding: 'utf8' });
  } catch {
    // Ignore if not set
  }
}

function makeExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Ignore on Windows
  }
}

function usage() {
  console.log(`
Usage:
  node .githooks/install.mjs [options]

Options:
  --uninstall  Remove hooks configuration
  --check      Check if hooks are installed (exit 0 if yes, 1 if no)
  -h, --help   Show this help message

Examples:
  node .githooks/install.mjs          # Install hooks
  node .githooks/install.mjs --check  # Check status
  node .githooks/install.mjs --uninstall
`.trim());
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('-h') || args.includes('--help')) {
    usage();
  }

  const doUninstall = args.includes('--uninstall');
  const doCheck = args.includes('--check');

  // Find repo root
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    console.error(colors.red('[error] Not inside a Git repository.'));
    process.exit(1);
  }

  const hooksDir = path.join(repoRoot, '.githooks');
  const relHooksDir = '.githooks';

  // Check mode
  if (doCheck) {
    const currentPath = getHooksPath();
    if (currentPath === relHooksDir || currentPath === hooksDir) {
      console.log(colors.green('[ok] Git hooks are installed.'));
      console.log(colors.dim(`  core.hooksPath = ${currentPath}`));
      process.exit(0);
    } else {
      console.log(colors.yellow('[info] Git hooks are not installed.'));
      if (currentPath) {
        console.log(colors.dim(`  core.hooksPath = ${currentPath} (custom)`));
      }
      process.exit(1);
    }
  }

  // Uninstall mode
  if (doUninstall) {
    unsetHooksPath();
    console.log(colors.green('[ok] Git hooks uninstalled.'));
    console.log(colors.dim('  Removed core.hooksPath configuration.'));
    process.exit(0);
  }

  // Install mode
  if (!fs.existsSync(hooksDir)) {
    console.error(colors.red(`[error] Hooks directory not found: ${relHooksDir}`));
    process.exit(1);
  }

  // Make hooks executable
  const hookFiles = ['pre-commit', 'commit-msg', 'pre-push', 'post-merge'];
  for (const hook of hookFiles) {
    const hookPath = path.join(hooksDir, hook);
    if (fs.existsSync(hookPath)) {
      makeExecutable(hookPath);
    }
  }

  // Set hooks path
  setHooksPath(relHooksDir);

  console.log(colors.green('[ok] Git hooks installed.'));
  console.log(colors.dim(`  core.hooksPath = ${relHooksDir}`));
  console.log('');
  console.log('Available hooks:');
  
  const installedHooks = fs.readdirSync(hooksDir)
    .filter((f) => !f.startsWith('.') && !f.endsWith('.mjs') && fs.statSync(path.join(hooksDir, f)).isFile());
  
  for (const hook of installedHooks) {
    console.log(`  - ${hook}`);
  }

  console.log('');
  console.log(colors.dim('To uninstall: node .githooks/install.mjs --uninstall'));
}

main();
