#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..', '..');
const SKILL_MD = 'SKILL.md';

const defaultSkillsRoot = path.join(repoRoot, '.ai', 'skills');
const defaultManifestPath = path.join(defaultSkillsRoot, '_meta', 'sync-manifest.json');
const providerDefaults = {
  codex: path.join(repoRoot, '.codex', 'skills'),
  claude: path.join(repoRoot, '.claude', 'skills'),
};

const colors = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

function printHelp() {
  const cmd = 'node .ai/scripts/sync-skills.mjs';
  console.log([
    'Sync provider skill stubs from SSOT skills.',
    '',
    `Usage: ${cmd} [options]`,
    '',
    'Options:',
    '  --providers <codex|claude|both|csv>   Providers to write (default: both)',
    '  --scope <all|minimal|current|specific> Skill selection scope (default: all)',
    '  --skills <csv>                        Skill names (for --scope specific)',
    '  --skill <name>                        Repeatable; adds one skill name',
    '  --manifest <path>                     JSON manifest (for --scope current)',
    '  --mode <reset|update>                 reset deletes provider roots; update is incremental (default: reset)',
    '  --prune                               With --mode update: delete wrappers not in selected set (destructive)',
    '  --delete <csv>                        Delete wrapper(s) only (no SSOT changes) (alias: --delete-wrappers)',
    '  --delete-wrappers <csv>               Delete wrapper(s) only (no SSOT changes)',
    '  --delete-skills <csv>                 Delete skill(s) from SSOT and/or providers (see --delete-scope)',
    '  --delete-scope <all|ssot|providers>   Deletion scope for --delete-skills (default: all)',
    '  --clean-empty                         With --delete-skills: remove empty parent dirs after deletion',
    '  --[no-]update-meta                    With --delete-skills: update .ai/skills/_meta/sync-manifest.json (default: update)',
    '  --list                                List discovered skills (respects --scope filters)',
    '  --dry-run                             Print actions without writing',
    '  --yes                                 Required for destructive operations (reset/prune/delete), unless --dry-run',
    '  -h, --help                            Show help',
    '',
    'Scopes:',
    '  all      - all skills under the SSOT skills root',
    '  minimal  - default minimal set (workflows only)',
    '  current  - read selection from a manifest JSON',
    '  specific - explicit list via --skills/--skill',
    '',
    'Manifest schema (JSON):',
    '  {',
    '    "version": 1,',
    '    "includePrefixes": ["workflows/", "backend/"],',
    '    "includeSkills": ["apply-backend-service-guidelines"],',
    '    "excludeSkills": ["experimental-skill"]',
    '  }',
    '',
  ].join('\n'));
}

function readFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return null;
  }
  return `---\n${match[1]}\n---\n\n`;
}

function extractName(frontmatter, fallback) {
  if (!frontmatter) return fallback;
  const match = frontmatter.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function resetDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(jsonPath) {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(colors.red(`Failed to read JSON: ${jsonPath}`));
    console.error(colors.red(`  ${e.message}`));
    process.exit(1);
  }
}

function parseManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.error(colors.red(`Missing manifest: ${manifestPath}`));
    process.exit(1);
  }
  const manifest = readJson(manifestPath);
  const includePrefixes = manifest.includePrefixes || manifest.prefixes || [];
  const includeSkills = manifest.includeSkills || manifest.skills || [];
  const excludeSkills = manifest.excludeSkills || manifest.exclude || [];

  if (!Array.isArray(includePrefixes) || !Array.isArray(includeSkills) || !Array.isArray(excludeSkills)) {
    console.error(colors.red(`Invalid manifest schema: ${manifestPath}`));
    console.error(colors.red('Expected arrays: includePrefixes/includeSkills/excludeSkills'));
    process.exit(1);
  }

  return {
    includePrefixes: includePrefixes.map((p) => String(p)),
    includeSkills: includeSkills.map((s) => String(s)),
    excludeSkills: excludeSkills.map((s) => String(s)),
  };
}

function findSkillDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    console.error(colors.red(`Missing skills root: ${rootDir}`));
    process.exit(1);
  }

  const ignoreDirNames = new Set([
    '.git',
    '.hg',
    '.svn',
    '__pycache__',
    'node_modules',
    '_meta',
  ]);

  const stack = [rootDir];
  const skillDirs = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasSkillMd = entries.some((e) => e.isFile() && e.name === SKILL_MD);
    if (hasSkillMd) {
      skillDirs.push(dir);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ignoreDirNames.has(entry.name)) continue;
      stack.push(path.join(dir, entry.name));
    }
  }

  return skillDirs.sort((a, b) => a.localeCompare(b));
}

function loadSkills(skillsRoot) {
  const skillDirs = findSkillDirs(skillsRoot);
  const skills = [];

  for (const dir of skillDirs) {
    const skillMdPath = path.join(dir, SKILL_MD);
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const frontmatter = readFrontmatter(content);
    const fallback = path.basename(dir);
    const name = extractName(frontmatter || '', fallback);

    const relFromSkillsRoot = toPosix(path.relative(skillsRoot, dir));
    const relFromRepoRoot = toPosix(path.relative(repoRoot, dir));
    const dirName = path.basename(dir);

    skills.push({
      name,
      dir,
      dirName,
      relFromSkillsRoot,
      relFromRepoRoot,
      skillMdPath,
      content,
    });
  }

  const byName = new Map();
  const dupes = [];
  for (const s of skills) {
    if (byName.has(s.name)) {
      dupes.push([byName.get(s.name), s]);
    } else {
      byName.set(s.name, s);
    }
  }

  if (dupes.length > 0) {
    console.error(colors.red('Duplicate skill names detected (must be unique):'));
    for (const [a, b] of dupes) {
      console.error(colors.red(`- ${a.name}:`));
      console.error(colors.red(`  - ${a.relFromRepoRoot}/${SKILL_MD}`));
      console.error(colors.red(`  - ${b.relFromRepoRoot}/${SKILL_MD}`));
    }
    process.exit(1);
  }

  for (const s of skills) {
    if (s.dirName !== s.name) {
      console.log(colors.gray(`  [!] name != dir: ${s.name} (dir: ${s.dirName})`));
    }
  }

  return { skills, byName };
}

function buildStub(skillName, sourceRelDirFromRepoRoot, sourceContent, relFromSkillsRoot) {
  const originalFrontmatter = readFrontmatter(sourceContent);
  const canonicalDir = sourceRelDirFromRepoRoot.replace(/\/$/, '');

  // Extract category from relFromSkillsRoot (e.g., "workflows/common/fix-frontend-runtime-errors" -> "workflows/common")
  const pathParts = relFromSkillsRoot.split('/');
  const category = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';

  // Build enhanced frontmatter with ssot_path and category (Option B).
  let enhancedFrontmatter;
  if (originalFrontmatter) {
    // Insert ssot_path and category before the closing ---
    const lines = originalFrontmatter.trim().split('\n');
    const closingIdx = lines.lastIndexOf('---');
    if (closingIdx > 0) {
      lines.splice(closingIdx, 0, `ssot_path: ${canonicalDir}`);
      if (category) {
        lines.splice(closingIdx, 0, `category: ${category}`);
      }
    }
    enhancedFrontmatter = lines.join('\n');
  } else {
    const categoryLine = category ? `category: ${category}\n` : '';
    enhancedFrontmatter = `---\nname: ${skillName}\ndescription: See ${canonicalDir}/SKILL.md\n${categoryLine}ssot_path: ${canonicalDir}\n---`;
  }

  const displayName = extractName(enhancedFrontmatter, skillName);

  return [
    enhancedFrontmatter,
    '',
    `# ${displayName} (entry)`,
    '',
    `Canonical source: \`${canonicalDir}/\``,
    '',
    `Open \`${canonicalDir}/SKILL.md\` and any supporting files referenced there (for example \`reference.md\`, \`examples.md\`, \`scripts/\`, \`templates/\`).`,
    '',
    '> **Note**: The frontmatter above is identical to the canonical source except for `ssot_path` and `category` which are added for navigation. After opening the source file, skip re-reading the description to avoid redundant token usage.',
    '',
  ].join('\n');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    skillsRoot: defaultSkillsRoot,
    manifestPath: defaultManifestPath,
    providers: ['codex', 'claude'],
    scope: 'all',
    mode: 'reset',
    prune: false,
    list: false,
    dryRun: false,
    yes: false,
    specificSkills: [],
    deleteWrappers: [],
    deleteSkillDirs: [],
    deleteScope: 'all',
    cleanEmpty: false,
    updateMeta: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
      continue;
    }
    if (a === '-y' || a === '--yes') {
      args.yes = true;
      continue;
    }
    if (a === '--providers' || a === '--provider') {
      args.providers = parseCsv(argv[i + 1] || 'both');
      i += 1;
      continue;
    }
    if (a === '--scope') {
      args.scope = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--mode') {
      args.mode = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--prune') {
      args.prune = true;
      continue;
    }
    if (a === '--list') {
      args.list = true;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--manifest') {
      args.manifestPath = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--skills') {
      args.specificSkills.push(...parseCsv(argv[i + 1] || ''));
      i += 1;
      continue;
    }
    if (a === '--skill') {
      args.specificSkills.push(String(argv[i + 1] || '').trim());
      i += 1;
      continue;
    }
    if (a === '--delete' || a === '--delete-wrappers') {
      args.deleteWrappers.push(...parseCsv(argv[i + 1] || ''));
      i += 1;
      continue;
    }
    if (a === '--delete-skills') {
      args.deleteSkillDirs.push(...parseCsv(argv[i + 1] || ''));
      i += 1;
      continue;
    }
    if (a === '--delete-scope') {
      args.deleteScope = String(argv[i + 1] || '').toLowerCase();
      i += 1;
      continue;
    }
    if (a === '--clean-empty') {
      args.cleanEmpty = true;
      continue;
    }
    if (a === '--update-meta') {
      args.updateMeta = true;
      continue;
    }
    if (a === '--no-update-meta') {
      args.updateMeta = false;
      continue;
    }

    console.error(colors.red(`Unknown argument: ${a}`));
    console.error(colors.gray('Use --help for usage.'));
    process.exit(1);
  }

  return args;
}

function normalizeProviders(providers) {
  const raw = providers.length === 0 ? ['both'] : providers;
  const expanded = raw.flatMap((p) => {
    const v = String(p).trim().toLowerCase();
    if (!v || v === 'both') return ['codex', 'claude'];
    return [v];
  });

  const dedup = [...new Set(expanded)];
  const invalid = dedup.filter((p) => !Object.prototype.hasOwnProperty.call(providerDefaults, p));
  if (invalid.length > 0) {
    console.error(colors.red(`Invalid provider(s): ${invalid.join(', ')}`));
    process.exit(1);
  }
  return dedup;
}

function selectSkills(args, allSkills) {
  const scope = String(args.scope || '').toLowerCase();
  if (scope === 'all' || scope === '') {
    return allSkills;
  }
  if (scope === 'minimal') {
    return allSkills.filter((s) => s.relFromSkillsRoot.startsWith('workflows/'));
  }
  if (scope === 'current') {
    const manifest = parseManifest(args.manifestPath);
    const selected = new Map();

    for (const prefixRaw of manifest.includePrefixes) {
      const prefix = String(prefixRaw).replace(/\\/g, '/').replace(/^\/+/, '');
      const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
      for (const s of allSkills) {
        if (s.relFromSkillsRoot === prefix || s.relFromSkillsRoot.startsWith(normalized)) {
          selected.set(s.name, s);
        }
      }
    }

    for (const name of manifest.includeSkills) {
      const found = allSkills.find((s) => s.name === name);
      if (!found) {
        console.error(colors.red(`Manifest references missing skill: ${name}`));
        process.exit(1);
      }
      selected.set(found.name, found);
    }

    for (const name of manifest.excludeSkills) {
      selected.delete(name);
    }

    return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (scope === 'specific') {
    const names = [...new Set(args.specificSkills.map((s) => String(s).trim()).filter(Boolean))];
    if (names.length === 0) {
      console.error(colors.red('No skills provided for --scope specific (use --skills or --skill).'));
      process.exit(1);
    }
    const out = [];
    for (const name of names) {
      const found = allSkills.find((s) => s.name === name);
      if (!found) {
        console.error(colors.red(`Unknown skill: ${name}`));
        process.exit(1);
      }
      out.push(found);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  console.error(colors.red(`Invalid --scope: ${args.scope}`));
  process.exit(1);
}

/**
 * Find all wrapper directories (containing SKILL.md) under targetRoot.
 * Returns array of { relPath, absPath } where relPath is relative to targetRoot.
 */
function findWrapperDirs(targetRoot) {
  if (!fs.existsSync(targetRoot)) return [];

  const wrappers = [];
  const stack = [targetRoot];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasSkillMd = entries.some((e) => e.isFile() && e.name === SKILL_MD);
    if (hasSkillMd) {
      wrappers.push({
        relPath: toPosix(path.relative(targetRoot, dir)),
        absPath: dir,
      });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      stack.push(path.join(dir, entry.name));
    }
  }

  return wrappers;
}

function deleteWrappers({ providers, skillNames, dryRun, allSkills }) {
  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Deleting skill stubs'));
  console.log(colors.cyan('========================================'));

  // Build a map from skill name to relFromSkillsRoot
  const nameToPath = new Map();
  if (allSkills) {
    for (const s of allSkills) {
      nameToPath.set(s.name, s.relFromSkillsRoot);
    }
  }

  for (const provider of providers) {
    const targetRoot = providerDefaults[provider];
    console.log('');
    console.log(colors.green(`Provider: ${provider}`));

    for (const nameOrPath of skillNames) {
      // Try to resolve name to path using allSkills, otherwise treat as path
      const targetRelPath = nameToPath.get(nameOrPath) || nameOrPath;
      const targetDir = path.join(targetRoot, targetRelPath);

      if (!fs.existsSync(targetDir)) {
        console.log(colors.gray(`  [-] ${targetRelPath} (not present)`));
        continue;
      }

      if (dryRun) {
        console.log(colors.gray(`  [~] ${targetRelPath} (dry-run delete)`));
        continue;
      }

      fs.rmSync(targetDir, { recursive: true, force: true });
      console.log(colors.gray(`  [-] ${targetRelPath}`));
    }
  }
}

function resolveSafeChildDir(rootDir, relPath) {
  const absRoot = path.resolve(rootDir);
  const absTarget = path.resolve(rootDir, String(relPath || ''));
  const rel = path.relative(absRoot, absTarget);
  if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return absTarget;
}

function cleanEmptyParents(dirPath, stopAt) {
  let current = path.dirname(dirPath);
  const stopAtAbs = path.resolve(stopAt);

  while (current !== stopAtAbs && current.startsWith(stopAtAbs)) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        fs.rmdirSync(current);
      } else {
        break;
      }
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

function deleteDirSafe(rootDir, relPath, label, options) {
  const { dryRun, cleanEmpty, stopAt } = options;

  const targetDir = resolveSafeChildDir(rootDir, relPath);
  if (!targetDir) {
    console.log(colors.red(`  [!] ${label}: path traversal blocked (${relPath})`));
    return { deleted: false, reason: 'blocked' };
  }

  if (!fs.existsSync(targetDir)) {
    console.log(colors.gray(`  [-] ${label}: not present`));
    return { deleted: false, reason: 'not_found' };
  }

  if (dryRun) {
    console.log(colors.yellow(`  [~] ${label}: ${toPosix(path.relative(repoRoot, targetDir))}/ (dry-run)`));
    return { deleted: true, reason: 'dry_run' };
  }

  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(colors.green(`  [✓] ${label}: ${toPosix(path.relative(repoRoot, targetDir))}/`));

    if (cleanEmpty && stopAt) {
      cleanEmptyParents(targetDir, stopAt);
    }

    return { deleted: true, reason: 'deleted' };
  } catch (err) {
    console.log(colors.red(`  [!] ${label}: failed to delete (${err.message})`));
    return { deleted: false, reason: 'error' };
  }
}

function resolveSkillRelPathForDelete(identifier, allSkills) {
  const normalized = toPosix(identifier).replace(/^\/+|\/+$/g, '');

  // First, try to match by relative path
  const byPath = allSkills.find((s) => s.relFromSkillsRoot === normalized);
  if (byPath) {
    return { relPath: byPath.relFromSkillsRoot, skillName: byPath.name };
  }

  // Then, try to match by name (may have multiple matches if dirName overlaps)
  const byName = allSkills.filter((s) => s.name === normalized || s.dirName === normalized);
  if (byName.length === 1) {
    return { relPath: byName[0].relFromSkillsRoot, skillName: byName[0].name };
  }
  if (byName.length > 1) {
    console.error(colors.red(`Ambiguous skill identifier "${normalized}". Multiple matches found:`));
    for (const s of byName) {
      console.error(colors.red(`  - ${s.relFromSkillsRoot}`));
    }
    console.error(colors.gray('Use the full path to specify which one to delete.'));
    return null;
  }

  // Not found
  return { relPath: normalized, skillName: null };
}

function updateSyncManifestAfterDelete(skillNames, dryRun) {
  const manifestPath = defaultManifestPath;
  if (!fs.existsSync(manifestPath)) {
    console.log(colors.gray(`  [-] meta: manifest not found (${toPosix(path.relative(repoRoot, manifestPath))})`));
    return { op: 'skip', path: manifestPath, reason: 'missing' };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(colors.red(`Failed to read manifest JSON: ${toPosix(path.relative(repoRoot, manifestPath))}`));
    console.error(colors.red(`  ${err.message}`));
    process.exit(1);
  }

  const includePrefixes = Array.isArray(manifest.includePrefixes)
    ? manifest.includePrefixes
    : Array.isArray(manifest.prefixes)
      ? manifest.prefixes
      : [];
  const includeSkills = Array.isArray(manifest.includeSkills)
    ? manifest.includeSkills
    : Array.isArray(manifest.skills)
      ? manifest.skills
      : [];
  const excludeSkills = Array.isArray(manifest.excludeSkills)
    ? manifest.excludeSkills
    : Array.isArray(manifest.exclude)
      ? manifest.exclude
      : [];

  const removeSet = new Set(skillNames.map((s) => String(s)));
  const nextIncludeSkills = includeSkills.filter((s) => !removeSet.has(String(s)));
  const nextExcludeSkills = excludeSkills.filter((s) => !removeSet.has(String(s)));

  const removedFromInclude = includeSkills.filter((s) => removeSet.has(String(s)));
  const removedFromExclude = excludeSkills.filter((s) => removeSet.has(String(s)));

  const changed = removedFromInclude.length > 0 || removedFromExclude.length > 0;
  if (!changed) {
    console.log(colors.gray('  [=] meta: sync-manifest.json already has no deleted-skill references'));
    return { op: 'noop', path: manifestPath };
  }

  const updated = {
    ...manifest,
    version: manifest.version || 1,
    includePrefixes,
    includeSkills: nextIncludeSkills,
    excludeSkills: nextExcludeSkills,
  };
  delete updated.prefixes;
  delete updated.skills;
  delete updated.exclude;

  const note = `remove includeSkills/excludeSkills refs: -${removedFromInclude.length} include, -${removedFromExclude.length} exclude`;
  if (dryRun) {
    console.log(colors.yellow(`  [~] meta: would update sync-manifest.json (${note})`));
    return { op: 'write', path: manifestPath, mode: 'dry-run', note };
  }

  fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  console.log(colors.gray(`  [+] meta: updated sync-manifest.json (${note})`));
  return { op: 'write', path: manifestPath, mode: 'applied', note };
}

function deleteSkills({ providers, identifiers, deleteScope, cleanEmpty, updateMeta, dryRun, allSkills }) {
  const scope = String(deleteScope || 'all').toLowerCase();
  const validScopes = new Set(['all', 'ssot', 'providers']);
  if (!validScopes.has(scope)) {
    console.error(colors.red(`Invalid --delete-scope: ${deleteScope}`));
    console.error(colors.gray(`Valid values: ${[...validScopes].join(', ')}`));
    process.exit(1);
  }

  const raw = identifiers.map((s) => String(s || '').trim()).filter(Boolean);
  if (raw.length === 0) {
    console.error(colors.red('No skills specified for --delete-skills.'));
    console.error(colors.gray('Use --delete-skills "<csv>" to specify skills.'));
    process.exit(1);
  }

  const resolved = [];
  const skillNamesForMeta = new Set();
  for (const id of raw) {
    const r = resolveSkillRelPathForDelete(id, allSkills);
    if (r === null) process.exit(1);

    const relPath = String(r.relPath || '').replace(/^\/+|\/+$/g, '');
    if (!relPath || relPath === '.' || relPath.startsWith('_meta')) {
      console.error(colors.red(`Refusing to delete non-skill path: "${id}" -> "${relPath || '(empty)'}"`));
      process.exit(1);
    }

    if ((scope === 'all' || scope === 'ssot') && !r.skillName) {
      console.error(colors.red(`Unknown skill "${id}" (not found under SSOT skills root).`));
      console.error(colors.gray('Hint: use the exact skill name, or use wrapper-only deletion via --delete.'));
      process.exit(1);
    }

    if (r.skillName) skillNamesForMeta.add(r.skillName);
    resolved.push({ identifier: id, relPath, skillName: r.skillName });
  }

  const byPath = new Map();
  for (const r of resolved) {
    if (!byPath.has(r.relPath)) byPath.set(r.relPath, r);
  }
  const targets = [...byPath.values()];

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Deleting skills'));
  console.log(colors.cyan('========================================'));
  console.log(colors.gray(`  delete_scope: ${scope}`));
  console.log(colors.gray(`  skills: ${targets.length}`));
  console.log(colors.gray(`  dry-run: ${dryRun}`));

  for (const t of targets) {
    console.log('');
    console.log(colors.cyan(`Skill: ${t.relPath}`));

    const opts = { dryRun, cleanEmpty };

    if (scope === 'all' || scope === 'ssot') {
      deleteDirSafe(defaultSkillsRoot, t.relPath, 'SSOT', { ...opts, stopAt: defaultSkillsRoot });
    }

    if (scope === 'all' || scope === 'providers') {
      for (const provider of providers) {
        const providerRoot = providerDefaults[provider];
        deleteDirSafe(providerRoot, t.relPath, provider, { ...opts, stopAt: providerRoot });
      }
    }
  }

  if ((scope === 'all' || scope === 'ssot') && updateMeta && skillNamesForMeta.size > 0) {
    console.log('');
    console.log(colors.cyan('Meta updates:'));
    updateSyncManifestAfterDelete([...skillNamesForMeta], dryRun);
  }

  console.log('');
  console.log(colors.cyan('========================================'));
  console.log(colors.green('  Delete complete'));
  console.log(colors.cyan('========================================'));
  if (dryRun) {
    console.log(colors.yellow('Dry-run mode: no files were actually deleted.'));
    console.log(colors.gray('Re-run with --yes to perform the deletion.'));
  }
}

function sync() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const providers = normalizeProviders(args.providers);
  const mode = String(args.mode || '').toLowerCase() || 'reset';
  if (!['reset', 'update'].includes(mode)) {
    console.error(colors.red(`Invalid --mode: ${args.mode}`));
    process.exit(1);
  }

  const isDestructive =
    !args.list &&
    !args.dryRun &&
    (mode === 'reset' ||
      (mode === 'update' && args.prune) ||
      args.deleteWrappers.length > 0 ||
      args.deleteSkillDirs.length > 0);
  if (isDestructive && !args.yes) {
    console.error(colors.red('Refusing to perform destructive operations without --yes.'));
    console.error(colors.gray('Destructive operations include: --mode reset, --mode update --prune, --delete-wrappers, and --delete-skills.'));
    console.error(colors.gray('Preview safely with --dry-run, then re-run with --yes.'));
    process.exit(1);
  }

  const { skills: allSkills } = loadSkills(args.skillsRoot);
  const hasDeleteSkills = args.deleteSkillDirs.length > 0;
  const hasDeleteWrappers = args.deleteWrappers.length > 0;

  if (hasDeleteSkills && hasDeleteWrappers) {
    console.error(colors.red('Cannot combine --delete-skills with --delete/--delete-wrappers.'));
    process.exit(1);
  }

  if (args.list) {
    if (hasDeleteSkills || hasDeleteWrappers) {
      console.error(colors.red('Cannot combine --list with delete operations.'));
      process.exit(1);
    }
    const selectedSkills = selectSkills(args, allSkills);
    for (const s of selectedSkills) {
      console.log(`${s.name}\t${s.relFromSkillsRoot}`);
    }
    return;
  }

  if (hasDeleteSkills) {
    deleteSkills({
      providers,
      identifiers: args.deleteSkillDirs,
      deleteScope: args.deleteScope,
      cleanEmpty: args.cleanEmpty,
      updateMeta: args.updateMeta,
      dryRun: args.dryRun,
      allSkills,
    });
    return;
  }

  if (hasDeleteWrappers) {
    deleteWrappers({ providers, skillNames: args.deleteWrappers, dryRun: args.dryRun, allSkills });
    return;
  }

  const selectedSkills = selectSkills(args, allSkills);

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Syncing skill stubs'));
  console.log(colors.cyan('========================================'));
  console.log(colors.gray(`  skills_root: ${toPosix(path.relative(repoRoot, args.skillsRoot)) || '.'}`));
  console.log(colors.gray(`  providers: ${providers.join(', ')}`));
  console.log(colors.gray(`  scope: ${args.scope}`));
  console.log(colors.gray(`  mode: ${mode}${mode === 'update' && args.prune ? ' + prune' : ''}`));
  console.log(colors.gray(`  selected_skills: ${selectedSkills.length}`));
  // Use relFromSkillsRoot (paths) for matching instead of flat names (Option A).
  const allPaths = new Set(allSkills.map((s) => s.relFromSkillsRoot));
  const selectedPaths = new Set(selectedSkills.map((s) => s.relFromSkillsRoot));

  for (const provider of providers) {
    const targetRoot = providerDefaults[provider];
    console.log('');
    console.log(colors.green(`Writing ${provider} stubs...`));

    if (mode === 'reset') {
      if (args.dryRun) {
        console.log(colors.gray(`  [~] reset ${toPosix(path.relative(repoRoot, targetRoot))} (dry-run)`));
      } else {
        resetDir(targetRoot);
      }
    } else {
      if (args.dryRun) {
        console.log(colors.gray(`  [~] ensure ${toPosix(path.relative(repoRoot, targetRoot))} (dry-run)`));
      } else {
        ensureDir(targetRoot);
      }
    }

    if (mode === 'update' && args.prune) {
      // Find existing wrappers recursively (they now have hierarchy)
      const existingWrappers = findWrapperDirs(targetRoot);
      for (const wrapper of existingWrappers) {
        if (!allPaths.has(wrapper.relPath)) continue; // not a known skill
        if (selectedPaths.has(wrapper.relPath)) continue; // is in selected set
        if (args.dryRun) {
          console.log(colors.gray(`  [~] prune ${wrapper.relPath} (dry-run)`));
        } else {
          fs.rmSync(wrapper.absPath, { recursive: true, force: true });
          console.log(colors.gray(`  [-] ${wrapper.relPath} (pruned)`));
        }
      }
    }

    for (const skill of selectedSkills) {
      const sourceRelDir = toPosix(path.relative(repoRoot, skill.dir));
      const stub = buildStub(skill.name, sourceRelDir, skill.content, skill.relFromSkillsRoot);
      // Option A: preserve hierarchy using relFromSkillsRoot instead of flat names.
      const targetDir = path.join(targetRoot, skill.relFromSkillsRoot);
      const targetSkillMd = path.join(targetDir, SKILL_MD);

      if (args.dryRun) {
        console.log(colors.gray(`  [~] write ${skill.relFromSkillsRoot} -> ${toPosix(path.relative(repoRoot, targetSkillMd))}`));
        continue;
      }

      ensureDir(targetDir);
      fs.writeFileSync(targetSkillMd, stub, 'utf8');
      console.log(colors.gray(`  [+] ${skill.relFromSkillsRoot}`));
    }
  }

  console.log('');
  console.log(colors.cyan('========================================'));
  console.log(colors.green('  Skill stubs synced'));
  console.log(colors.cyan('========================================'));
}

sync();
