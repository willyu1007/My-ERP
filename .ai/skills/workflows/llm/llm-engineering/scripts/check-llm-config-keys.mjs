#!/usr/bin/env node

/**
 * LLM Config Key Registry Check
 *
 * Enforces that in-scope LLM env/config keys referenced in code are registered in:
 *   .ai/llm-config/registry/config_keys.yaml
 *
 * Why:
 * - prevents ad-hoc / duplicated configuration keys
 * - reduces drift and "magic strings" across the codebase
 * - makes reviews and rollbacks safer
 *
 * Notes:
 * - Dependency-free (no npm installs required)
 * - Ignores Markdown to avoid doc false-positives
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function die(msg) {
  console.error(colors.red(msg));
  process.exit(1);
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function stripInlineComment(line) {
  const idx = line.indexOf('#');
  if (idx === -1) return line;
  return line.slice(0, idx);
}

function unquote(s) {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function uniqueList(list) {
  return Array.from(new Set(list));
}

function findRepoRoot(startDir) {
  // Walk up until we find the expected registry path.
  let dir = startDir;
  for (let i = 0; i < 50; i++) {
    const candidate = path.join(dir, '.ai', 'llm-config', 'registry', 'config_keys.yaml');
    if (fs.existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function parseConfigKeysYaml(raw) {
  // Minimal YAML parsing tailored to this file's structure:
  // version: 1
  // keys:
  //   - KEY_A
  // scope_prefixes:
  //   - LLM_
  const keys = [];
  const scopePrefixes = [];
  let mode = null;

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^keys\s*:\s*$/.test(trimmed)) {
      mode = 'keys';
      continue;
    }
    if (/^scope_prefixes\s*:\s*$/.test(trimmed)) {
      mode = 'scope_prefixes';
      continue;
    }

    const m = trimmed.match(/^\-\s*(.+)\s*$/);
    if (!m) continue;

    const value = unquote(m[1]);
    if (!value) continue;

    if (mode === 'keys') keys.push(value);
    if (mode === 'scope_prefixes') scopePrefixes.push(value);
  }

  return { keys, scopePrefixes };
}

function hasAnyPrefix(key, prefixes) {
  for (const p of prefixes) {
    if (key.startsWith(p)) return true;
  }
  return false;
}

function walkFiles(rootDir) {
  const ignoreDirs = new Set([
    '.git',
    'node_modules',
    '.codex',
    '.claude',
    'init',
    '__MACOSX',
  ]);

  const includeExt = new Set([
    '.js', '.jsx', '.ts', '.tsx',
    '.cjs', '.mjs',
    '.py', '.go', '.java', '.kt', '.cs',
    '.rb', '.php',
    '.sh', '.bash', '.zsh',
    '.json', '.yaml', '.yml',
    '.toml',
    '.env',
  ]);

  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ignoreDirs.has(ent.name)) continue;
        stack.push(full);
        continue;
      }

      if (!ent.isFile()) continue;

      // Exclude markdown/docs to avoid false positives from documentation.
      if (ent.name.toLowerCase().endsWith('.md')) continue;

      const ext = path.extname(ent.name);
      if (includeExt.has(ext) || ent.name.startsWith('.env')) {
        results.push(full);
      }
    }
  }

  return results;
}

function extractEnvKeys(content) {
  const found = [];

  const patterns = [
    // Node/TS
    /process\.env\.([A-Z0-9_]+)/g,
    /process\.env\[['"]([A-Z0-9_]+)['"]\]/g,

    // Python
    /os\.environ\[['"]([A-Z0-9_]+)['"]\]/g,
    /os\.environ\.get\(['"]([A-Z0-9_]+)['"]/g,
    /os\.getenv\(['"]([A-Z0-9_]+)['"]/g,

    // Go
    /os\.Getenv\(['"]([A-Z0-9_]+)['"]\)/g,

    // Java/Kotlin
    /System\.getenv\(['"]([A-Z0-9_]+)['"]\)/g,

    // .NET
    /Environment\.GetEnvironmentVariable\(['"]([A-Z0-9_]+)['"]\)/g,

    // Ruby
    /ENV\[['"]([A-Z0-9_]+)['"]\]/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      found.push(m[1]);
    }
  }

  // .env style: KEY=VALUE
  const envLine = /^\s*([A-Z0-9_]+)\s*=\s*.+$/gm;
  let m;
  while ((m = envLine.exec(content)) !== null) {
    found.push(m[1]);
  }

  return found;
}

function main() {
  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  LLM Config Key Registry Check'));
  console.log(colors.cyan('========================================'));
  console.log('');

  const repoRoot = findRepoRoot(__dirname);
  if (!repoRoot) {
    die('Unable to locate repo root: expected `.ai/llm-config/registry/config_keys.yaml` in an ancestor directory.');
  }

  const registryPath = path.join(repoRoot, '.ai', 'llm-config', 'registry', 'config_keys.yaml');
  if (!fs.existsSync(registryPath)) {
    die(`Missing registry: ${registryPath}`);
  }

  const raw = readFileSafe(registryPath);
  if (!raw) {
    die(`Failed to read registry: ${registryPath}`);
  }

  const { keys: rawKeys, scopePrefixes: rawPrefixes } = parseConfigKeysYaml(raw);

  const allowedKeys = uniqueList(rawKeys);
  const scopePrefixes = uniqueList(rawPrefixes.length ? rawPrefixes : ['LLM_']);

  const dupes = rawKeys.filter((k, i) => rawKeys.indexOf(k) !== i);
  if (dupes.length) {
    die(`Duplicate keys in registry: ${uniqueList(dupes).join(', ')}`);
  }

  if (allowedKeys.length === 0) {
    console.log(colors.yellow('Warning: config_keys.yaml contains zero keys.'));
  }

  console.log(colors.gray(`Registry: ${path.relative(repoRoot, registryPath)}`));
  console.log(colors.gray(`Scope prefixes: ${scopePrefixes.join(', ')}`));
  console.log(colors.gray(`Registered keys: ${allowedKeys.length}`));
  console.log('');

  const files = walkFiles(repoRoot);
  const seen = new Map(); // key -> Set<file>

  for (const f of files) {
    const content = readFileSafe(f);
    if (!content) continue;

    const keysInFile = extractEnvKeys(content);
    for (const k of keysInFile) {
      if (!hasAnyPrefix(k, scopePrefixes)) continue;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k).add(f);
    }
  }

  const keysUsed = Array.from(seen.keys()).sort();
  console.log(colors.gray(`Found ${keysUsed.length} in-scope env/config keys referenced in repo.`));

  const missing = [];
  for (const k of keysUsed) {
    if (!allowedKeys.includes(k)) missing.push(k);
  }

  if (missing.length) {
    console.log('');
    console.log(colors.red('Unregistered LLM config keys found:'));
    for (const k of missing) {
      const filesForKey = Array.from(seen.get(k)).map((p) => path.relative(repoRoot, p));
      console.log(colors.red(`  - ${k}`));
      for (const fp of filesForKey.slice(0, 10)) {
        console.log(colors.red(`      ${fp}`));
      }
      if (filesForKey.length > 10) {
        console.log(colors.red(`      ... (+${filesForKey.length - 10} more)`));
      }
    }
    console.log('');
    console.log('Fix: register keys in `.ai/llm-config/registry/config_keys.yaml` and re-run this check.');
    process.exit(1);
  }

  console.log(colors.green('OK: all in-scope LLM config keys are registered.'));
}

main();
