#!/usr/bin/env node

/**
 * Skill Quality Gate Script
 *
 * Validates skills in .ai/skills/ against quality standards:
 * - Valid YAML frontmatter with name/description
 * - Skill name matches directory name
 * - No forbidden resources/ directory
 * - SKILL.md <= 500 lines
 * - Presence of ## Verification and ## Boundaries sections
 * - No cross-skill references (optional)
 *
 * @reference .ai/skills/standards/naming-conventions/SKILL.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { colors } from './lib/colors.mjs';
import { extractFrontmatterBlock } from './lib/frontmatter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..', '..');
const SKILL_MD = 'SKILL.md';
const MAX_LINES = 500;

const defaultSkillsRoot = path.join(repoRoot, '.ai', 'skills');

function printHelp() {
  console.log([
    'Lint skills for quality standards.',
    '',
    'Usage: node .ai/scripts/lint-skills.mjs [options]',
    '',
    'Options:',
    '  --fix           Auto-fix issues where possible (frontmatter + required sections)',
    '  --strict        Treat warnings as errors',
    '  --quiet         Only show errors, not warnings',
    '  -h, --help      Show help',
    '',
    'Checks:',
    '  - Valid YAML frontmatter with name and description',
    '  - Skill name matches directory name',
    '  - No resources/ directory',
    '  - SKILL.md <= 500 lines',
    '  - Has ## Verification section',
    '  - Has ## Boundaries section',
    '',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = {
    fix: false,
    strict: false,
    quiet: false,
    help: false,
  };

  for (const a of argv) {
    if (a === '-h' || a === '--help') args.help = true;
    if (a === '--fix') args.fix = true;
    if (a === '--strict') args.strict = true;
    if (a === '--quiet') args.quiet = true;
  }

  return args;
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

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};

  // Simple YAML parsing for name and description
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);

  if (nameMatch) result.name = nameMatch[1].trim();
  if (descMatch) result.description = descMatch[1].trim();

  return result;
}

// extractFrontmatterBlock is imported from ./lib/frontmatter.mjs

function findFirstHeadingText(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('# ')) return t.slice(2).trim();
  }
  return null;
}

function ensureSection(content, heading, bodyLines) {
  const re = new RegExp(`^## ${heading}\\s*$`, 'm');
  if (re.test(content)) return { content, changed: false };
  const suffix = content.endsWith('\n') ? '' : '\n';
  const block = [`## ${heading}`, ...bodyLines, ''].join('\n');
  return { content: content + suffix + '\n' + block, changed: true };
}

function fixSkillFile(skillDir, skillsRoot) {
  const relPath = path.relative(skillsRoot, skillDir);
  const dirName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, SKILL_MD);

  if (!fs.existsSync(skillMdPath)) {
    return { relPath, changed: false, actions: ['Missing SKILL.md (cannot fix)'] };
  }

  const original = fs.readFileSync(skillMdPath, 'utf8');
  let content = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const actions = [];
  let changed = false;

  const fm = extractFrontmatterBlock(content);
  if (fm) {
    const lines = fm.yaml.split('\n');
    const out = [];
    let hasName = false;
    let hasDesc = false;

    for (const line of lines) {
      if (/^name:\s*/.test(line)) {
        out.push(`name: ${dirName}`);
        if (line.trim() !== `name: ${dirName}`) actions.push('Updated frontmatter name to match directory');
        hasName = true;
        continue;
      }
      if (/^description:\s*/.test(line)) {
        const existing = line.replace(/^description:\s*/, '').trim();
        if (existing.length === 0) {
          const inferred = findFirstHeadingText(fm.rest) || dirName;
          out.push(`description: ${inferred}`);
          actions.push('Filled missing frontmatter description');
        } else {
          out.push(line);
        }
        hasDesc = true;
        continue;
      }
      out.push(line);
    }

    if (!hasName) {
      out.push(`name: ${dirName}`);
      actions.push('Added missing frontmatter name');
    }
    if (!hasDesc) {
      const inferred = findFirstHeadingText(fm.rest) || dirName;
      out.push(`description: ${inferred}`);
      actions.push('Added missing frontmatter description');
    }

    const rebuilt = `---\n${out.join('\n')}\n---\n`;
    content = rebuilt + (fm.rest.startsWith('\n') ? fm.rest.slice(1) : fm.rest);
    changed = true;
  } else {
    const inferred = findFirstHeadingText(content) || dirName;
    const header = `---\nname: ${dirName}\ndescription: ${inferred}\n---\n\n`;
    content = header + content.replace(/^\n+/, '');
    actions.push('Inserted missing frontmatter');
    changed = true;
  }

  const v = ensureSection(content, 'Verification', [
    '',
    '- [ ] Add verification steps',
  ]);
  if (v.changed) {
    content = v.content;
    actions.push('Added missing ## Verification section');
    changed = true;
  }

  const b = ensureSection(content, 'Boundaries', [
    '',
    '- MUST define what this skill will not do',
  ]);
  if (b.changed) {
    content = b.content;
    actions.push('Added missing ## Boundaries section');
    changed = true;
  }

  if (!content.endsWith('\n')) {
    content += '\n';
    actions.push('Added final newline');
    changed = true;
  }

  if (changed && content !== original) {
    fs.writeFileSync(skillMdPath, content, 'utf8');
    return { relPath, changed: true, actions };
  }
  return { relPath, changed: false, actions: changed ? actions : [] };
}

function lintSkill(skillDir, skillsRoot) {
  const errors = [];
  const warnings = [];
  const relPath = path.relative(skillsRoot, skillDir);
  const dirName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, SKILL_MD);

  // Check SKILL.md exists
  if (!fs.existsSync(skillMdPath)) {
    errors.push('Missing SKILL.md');
    return { relPath, errors, warnings };
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const lines = content.split('\n');

  // Check line count
  if (lines.length > MAX_LINES) {
    errors.push(`SKILL.md exceeds ${MAX_LINES} lines (${lines.length} lines)`);
  }

  // Check frontmatter
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    errors.push('Missing or invalid YAML frontmatter');
  } else {
    if (!frontmatter.name) {
      errors.push('Frontmatter missing "name" field');
    } else if (frontmatter.name !== dirName) {
      errors.push(`Frontmatter name "${frontmatter.name}" does not match directory name "${dirName}"`);
    }
    if (!frontmatter.description) {
      errors.push('Frontmatter missing "description" field');
    }
  }

  // Check for resources/ directory (forbidden)
  const resourcesDir = path.join(skillDir, 'resources');
  if (fs.existsSync(resourcesDir)) {
    errors.push('Forbidden resources/ directory exists');
  }

  // Check for ## Verification section
  const hasVerification = /^## Verification\s*$/m.test(content);
  if (!hasVerification) {
    warnings.push('Missing ## Verification section');
  }

  // Check for ## Boundaries section
  const hasBoundaries = /^## Boundaries\s*$/m.test(content);
  if (!hasBoundaries) {
    warnings.push('Missing ## Boundaries section');
  }

  // Check for cross-skill references (optional warning)
  const crossRefPattern = /\[.*?\]\(\.\.\/.*?\/SKILL\.md\)/;
  if (crossRefPattern.test(content)) {
    warnings.push('Contains cross-skill reference links (may affect discoverability)');
  }

  return { relPath, errors, warnings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Skill Quality Lint'));
  console.log(colors.cyan('========================================'));
  console.log('');

  const skillDirs = findSkillDirs(defaultSkillsRoot);
  console.log(colors.gray(`Found ${skillDirs.length} skills to lint\n`));

  if (args.fix) {
    let fixedCount = 0;
    for (const skillDir of skillDirs) {
      const res = fixSkillFile(skillDir, defaultSkillsRoot);
      if (res.changed) {
        fixedCount += 1;
        console.log(colors.gray(`[fix] ${res.relPath}/`));
        for (const a of res.actions) console.log(colors.gray(`  - ${a}`));
      }
    }
    if (fixedCount > 0) console.log(colors.gray(`\n[fix] Updated ${fixedCount} skill(s).\n`));
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  for (const skillDir of skillDirs) {
    const result = lintSkill(skillDir, defaultSkillsRoot);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Print results
  for (const result of results) {
    const hasIssues = result.errors.length > 0 || result.warnings.length > 0;
    if (!hasIssues) continue;

    console.log(colors.cyan(`${result.relPath}/`));

    for (const error of result.errors) {
      console.log(colors.red(`  ✗ ${error}`));
    }

    if (!args.quiet) {
      for (const warning of result.warnings) {
        console.log(colors.yellow(`  ⚠ ${warning}`));
      }
    }

    console.log('');
  }

  // Summary
  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Summary'));
  console.log(colors.cyan('========================================'));
  console.log(`  Skills checked: ${results.length}`);
  console.log(`  ${colors.red(`Errors: ${totalErrors}`)}`);
  console.log(`  ${colors.yellow(`Warnings: ${totalWarnings}`)}`);

  const passCount = results.filter((r) => r.errors.length === 0 && r.warnings.length === 0).length;
  console.log(`  ${colors.green(`Passed: ${passCount}/${results.length}`)}`);
  console.log('');

  // Exit code
  if (totalErrors > 0) {
    console.log(colors.red('Lint failed with errors.'));
    process.exit(1);
  }

  if (args.strict && totalWarnings > 0) {
    console.log(colors.yellow('Lint failed (--strict mode, warnings treated as errors).'));
    process.exit(1);
  }

  console.log(colors.green('Lint passed.'));
}

main();
