#!/usr/bin/env node

/**
 * LLM Registry Validator
 *
 * Validates the repo's LLM SSOT registries under:
 *   .ai/llm-config/registry/*
 *
 * Goals:
 * - lightweight, dependency-free validation (no YAML library)
 * - catch duplicate IDs and broken references early
 * - provide an optional "strict" mode to prevent shipping template placeholders
 *
 * Usage:
 *   node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs
 *   node .../validate-llm-registry.mjs --strict
 *
 * @reference .ai/skills/standards/naming-conventions/SKILL.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Note: This script uses inline YAML parsing utilities for portability.
// The shared library at .ai/scripts/lib/yaml-lite.mjs contains equivalent functions.

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

function warn(msg) {
  console.warn(colors.yellow(msg));
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
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function uniqueList(list) {
  return Array.from(new Set(list));
}

function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, '.ai', 'llm-config', 'registry', 'config_keys.yaml');
    if (fs.existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function hasTemplateHeader(raw) {
  // Template marker is intentionally simple and cheap.
  // Real repos should remove "(template)" in the first-line comment headers.
  const head = raw.split(/\r?\n/).slice(0, 5).join('\n');
  return head.toLowerCase().includes('(template)');
}

function parseTopLevelVersion(raw) {
  // Minimal parsing for `version: <int>` at top level.
  const m = raw.match(/^\s*version\s*:\s*([0-9]+)\s*$/m);
  return m ? Number(m[1]) : null;
}

function parseListFieldValues(raw, listItemKey) {
  // Extract values from list items that look like:
  //   - <listItemKey>: value
  // We do NOT attempt full YAML; this is tuned to the template registry format.
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const re = new RegExp(`^\\s*\\-\\s*${listItemKey}\\s*:\\s*(.+)\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const m = line.match(re);
    if (!m) continue;
    const v = unquote(m[1]);
    if (v) values.push(v);
  }

  return values;
}

function parseAllScalarValues(raw, keyName) {
  // Extract scalar assignments that look like:
  //   keyName: value
  // across the entire document (used for referenced provider_id in profiles).
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const re = new RegExp(`^\\s*${keyName}\\s*:\\s*(.+)\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const m = line.match(re);
    if (!m) continue;
    const v = unquote(m[1]);
    if (v) values.push(v);
  }

  return values;
}

function parsePromptTemplates(raw) {
  // Extract (prompt_template_id, version) pairs.
  // Assumes format:
  // templates:
  //   - prompt_template_id: foo
  //     version: 1
  const pairs = [];
  let currentId = null;
  let currentVersion = null;

  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();

    const idMatch = line.match(/^\s*\-\s*prompt_template_id\s*:\s*(.+)\s*$/);
    if (idMatch) {
      // flush previous
      if (currentId && Number.isInteger(currentVersion)) {
        pairs.push({ id: currentId, version: currentVersion });
      }
      currentId = unquote(idMatch[1]);
      currentVersion = null;
      continue;
    }

    if (currentId) {
      const vMatch = line.match(/^\s*version\s*:\s*([0-9]+)\s*$/);
      if (vMatch) {
        currentVersion = Number(vMatch[1]);
      }
    }
  }

  if (currentId && Number.isInteger(currentVersion)) {
    pairs.push({ id: currentId, version: currentVersion });
  }

  return pairs;
}

function parseConfigKeys(raw) {
  // Minimal YAML parsing for config_keys.yaml structure.
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

function main() {
  const strict = process.argv.includes('--strict');

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  LLM Registry Validator'));
  console.log(colors.cyan('========================================'));
  console.log(colors.gray(`Mode: ${strict ? 'STRICT (template placeholders are errors)' : 'STANDARD (template placeholders are warnings)'}`));
  console.log('');

  const repoRoot = findRepoRoot(__dirname);
  if (!repoRoot) {
    die('Unable to locate repo root (expected `.ai/llm-config/registry/config_keys.yaml`).');
  }

  const registryDir = path.join(repoRoot, '.ai', 'llm-config', 'registry');
  const files = {
    providers: path.join(registryDir, 'providers.yaml'),
    profiles: path.join(registryDir, 'model_profiles.yaml'),
    prompts: path.join(registryDir, 'prompt_templates.yaml'),
    configKeys: path.join(registryDir, 'config_keys.yaml'),
  };

  for (const [k, p] of Object.entries(files)) {
    if (!fs.existsSync(p)) {
      die(`Missing registry file: ${path.relative(repoRoot, p)} (${k})`);
    }
  }

  const rawProviders = readFileSafe(files.providers);
  const rawProfiles = readFileSafe(files.profiles);
  const rawPrompts = readFileSafe(files.prompts);
  const rawConfig = readFileSafe(files.configKeys);

  if (!rawProviders || !rawProfiles || !rawPrompts || !rawConfig) {
    die('Failed to read one or more registry files.');
  }

  const providersVersion = parseTopLevelVersion(rawProviders);
  const profilesVersion = parseTopLevelVersion(rawProfiles);
  const promptsVersion = parseTopLevelVersion(rawPrompts);
  const configVersion = parseTopLevelVersion(rawConfig);

  if (!providersVersion) die('providers.yaml missing top-level `version: <int>`');
  if (!profilesVersion) die('model_profiles.yaml missing top-level `version: <int>`');
  if (!promptsVersion) die('prompt_templates.yaml missing top-level `version: <int>`');
  if (!configVersion) die('config_keys.yaml missing top-level `version: <int>`');

  const providerIds = parseListFieldValues(rawProviders, 'provider_id');
  const profileIds = parseListFieldValues(rawProfiles, 'profile_id');
  const referencedProviderIds = parseAllScalarValues(rawProfiles, 'provider_id');
  const promptPairs = parsePromptTemplates(rawPrompts);
  const { keys: configKeys } = parseConfigKeys(rawConfig);

  // Duplicate detection
  const dupProviders = providerIds.filter((v, i) => providerIds.indexOf(v) !== i);
  const dupProfiles = profileIds.filter((v, i) => profileIds.indexOf(v) !== i);

  const promptPairStrings = promptPairs.map((p) => `${p.id}@${p.version}`);
  const dupPrompts = promptPairStrings.filter((v, i) => promptPairStrings.indexOf(v) !== i);

  const dupKeys = configKeys.filter((v, i) => configKeys.indexOf(v) !== i);

  if (dupProviders.length) die(`Duplicate provider_id(s): ${uniqueList(dupProviders).join(', ')}`);
  if (dupProfiles.length) die(`Duplicate profile_id(s): ${uniqueList(dupProfiles).join(', ')}`);
  if (dupPrompts.length) die(`Duplicate prompt_template_id@version: ${uniqueList(dupPrompts).join(', ')}`);
  if (dupKeys.length) die(`Duplicate config key(s): ${uniqueList(dupKeys).join(', ')}`);

  // Cross-reference validation (profiles -> providers)
  const providerSet = new Set(providerIds);
  const referenced = uniqueList(referencedProviderIds);
  const missingProviders = referenced.filter((pid) => pid && !providerSet.has(pid));

  if (missingProviders.length) {
    die(`model_profiles.yaml references unknown provider_id(s): ${missingProviders.join(', ')}`);
  }

  // Prompt pair completeness
  const incompletePrompt = promptPairs.filter((p) => !p.id || !Number.isInteger(p.version));
  if (incompletePrompt.length) {
    die('prompt_templates.yaml contains an entry missing prompt_template_id or version');
  }

  // Summary
  console.log(colors.gray(`Registry dir: ${path.relative(repoRoot, registryDir)}`));
  console.log(colors.gray(`Providers: ${providerIds.length}`));
  console.log(colors.gray(`Profiles: ${profileIds.length}`));
  console.log(colors.gray(`Prompt templates: ${promptPairs.length}`));
  console.log(colors.gray(`Config keys: ${configKeys.length}`));

  // Template placeholder / readiness checks
  const templateWarnings = [];

  if (hasTemplateHeader(rawProviders)) templateWarnings.push('providers.yaml header still marked as (template)');
  if (hasTemplateHeader(rawProfiles)) templateWarnings.push('model_profiles.yaml header still marked as (template)');
  if (hasTemplateHeader(rawPrompts)) templateWarnings.push('prompt_templates.yaml header still marked as (template)');
  if (hasTemplateHeader(rawConfig)) templateWarnings.push('config_keys.yaml header still marked as (template)');

  // Common placeholder IDs used in this template
  const placeholderPatterns = [
    /^example\-/i,
  ];

  const hasPlaceholder = (v) => placeholderPatterns.some((re) => re.test(String(v || '')));

  const placeholderIds = [];
  for (const pid of providerIds) if (hasPlaceholder(pid)) placeholderIds.push(`provider_id:${pid}`);
  for (const pfid of profileIds) if (hasPlaceholder(pfid)) placeholderIds.push(`profile_id:${pfid}`);
  for (const p of promptPairs) if (hasPlaceholder(p.id)) placeholderIds.push(`prompt_template_id:${p.id}`);

  if (placeholderIds.length) {
    templateWarnings.push(`placeholder identifiers present: ${uniqueList(placeholderIds).join(', ')}`);
  }

  if (templateWarnings.length) {
    if (strict) {
      console.log('');
      die(`Registry still in TEMPLATE mode:\n- ${templateWarnings.join('\n- ')}\n\nFix: replace placeholders with real org/project data (and remove "(template)" markers).`);
    }

    console.log('');
    warn('Registry appears to be in TEMPLATE mode (this is fine for the template repo, but not for production):');
    for (const w of templateWarnings) warn(`- ${w}`);
    console.log(colors.gray('Tip: run with `--strict` in CI to prevent shipping template registries.'));
  }

  console.log('');
  console.log(colors.green('OK: registries are structurally valid.'));
}

main();
