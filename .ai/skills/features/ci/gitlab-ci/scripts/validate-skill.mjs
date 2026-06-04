#!/usr/bin/env node
/**
 * validate-skill.mjs
 *
 * Dependency-free structural validation for this skill folder.
 * - Ensures SKILL.md YAML front matter is present and well-formed
 * - Ensures referenced local files (reference/*, scripts/*) exist
 * - Ensures procedure docs include required sections to reduce ambiguity
 *
 * Usage:
 *   node scripts/validate-skill.mjs
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
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function die(msg) {
  console.error(colors.red(msg));
  process.exit(1);
}

function warn(msg) {
  console.warn(colors.yellow(msg));
}

function ok(msg) {
  console.log(colors.green(msg));
}

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function existsRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p);
}

function parseFrontMatter(md) {
  if (!md.startsWith('---')) return null;
  const idx = md.indexOf('\n---', 3);
  if (idx === -1) return null;
  const raw = md.slice(3, idx).trim().replace(/\r\n/g, '\n');
  const body = md.slice(idx + '\n---'.length).replace(/^\s*\n/, '');
  const out = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/);
    if (!m) return { error: `Invalid front matter line: "${line}"` };
    const k = m[1];
    let v = m[2] ?? '';
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return { front: out, body };
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md')).map((e) => path.join(dir, e.name));
}

function requireSection(md, heading) {
  const re = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'm');
  return re.test(md);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBacktickPaths(md) {
  const paths = new Set();
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const v = String(m[1] || '').trim();
    if (!v) continue;
    if (v.startsWith('reference/') || v.startsWith('scripts/') || v.startsWith('assets/')) paths.add(v);
  }
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  while ((m = linkRe.exec(md)) !== null) {
    const v = String(m[1] || '').trim();
    if (!v) continue;
    if (v.startsWith('reference/') || v.startsWith('scripts/') || v.startsWith('assets/')) paths.add(v);
  }
  return Array.from(paths);
}

function main() {
  const skillRoot = path.resolve(__dirname, '..');
  const skillNameDir = path.basename(skillRoot);
  const skillMdPath = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) die(`Missing SKILL.md at: ${skillMdPath}`);
  const skillMd = readUtf8(skillMdPath);
  const parsed = parseFrontMatter(skillMd);
  if (!parsed) die('SKILL.md is missing YAML front matter (--- ... ---).');
  if (parsed.error) die(parsed.error);
  const { front, body } = parsed;
  if (!front.name || !front.name.trim()) die('Front matter missing required field: name');
  if (!front.description || !front.description.trim()) die('Front matter missing required field: description');
  if (!/^[a-z0-9-]+$/.test(front.name)) die(`Invalid skill name "${front.name}". Use only [a-z0-9-] for portability.`);
  if (front.name !== skillNameDir) die(`Skill name mismatch. front matter name="${front.name}" but directory="${skillNameDir}".`);
  const refs = extractBacktickPaths(skillMd);
  let missing = [];
  for (const rel of refs) {
    if (!existsRel(skillRoot, rel)) missing.push(rel);
  }
  if (missing.length) die(`SKILL.md references missing files:\n- ${missing.join('\n- ')}`);
  const procDir = path.join(skillRoot, 'reference', 'procedures');
  const procs = listMarkdownFiles(procDir);
  if (!procs.length) die('No procedures found in reference/procedures/. Add at least one procedure.');
  const required = ['Goal', 'Inputs (collect before edits)', 'Steps', 'Outputs', 'Required verification', 'Boundaries'];
  const recommended = ['Troubleshooting'];
  let procErrors = 0;
  let procWarnings = 0;
  for (const p of procs) {
    const md = readUtf8(p).replace(/\r\n/g, '\n');
    for (const heading of required) {
      if (!requireSection(md, heading)) {
        procErrors += 1;
        console.error(colors.red(`Procedure missing section "## ${heading}": ${path.relative(skillRoot, p)}`));
      }
    }
    for (const heading of recommended) {
      if (!requireSection(md, heading)) {
        procWarnings += 1;
        warn(`Procedure missing recommended section "## ${heading}": ${path.relative(skillRoot, p)}`);
      }
    }
  }
  if (procErrors) die(`Procedure validation failed (${procErrors} missing section(s)).`);
  ok(`OK: ${front.name}`);
  console.log(colors.gray(`- SKILL.md: front matter OK; ${refs.length} local refs checked`));
  console.log(colors.gray(`- Procedures: ${procs.length} file(s) structurally OK`));
  if (procWarnings > 0) console.log(colors.yellow(`- Warnings: ${procWarnings} recommended section(s) missing`));
}

main();
