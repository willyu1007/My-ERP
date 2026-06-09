#!/usr/bin/env node
/*
 * UI governance guard — enforces token-only FEATURE code per ui/config/governance.json
 * (code_rules: disallow_inline_style, disallow_hardcoded_color_literals).
 *
 * Scope: feature code only (apps/web/app, apps/web/src). The @my-erp/ui kit and the
 * token/contract CSS layer are the SSOT for visuals and are intentionally out of scope
 * (they define the tokens that feature code consumes via classNames).
 *
 * Visuals in feature code must come from @my-erp/ui components + morethan token classes,
 * never inline styles or hardcoded colors.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['apps/web/src'];
const EXTS = new Set(['.ts', '.tsx']);
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const INLINE_STYLE = /style=\{\{/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
}

const files = [];
for (const r of ROOTS) if (existsSync(r)) walk(r, files);

const violations = [];
for (const f of files) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (INLINE_STYLE.test(line)) {
        violations.push({ f, n: i + 1, rule: 'inline-style', line: line.trim() });
      }
      if (HEX.test(line)) {
        violations.push({ f, n: i + 1, rule: 'hardcoded-color', line: line.trim() });
      }
    });
}

if (violations.length > 0) {
  console.error(
    `UI governance: ${violations.length} violation(s) — feature code must be token-only ` +
      `(use @my-erp/ui + morethan token classes, not inline styles or hex colors):`,
  );
  for (const v of violations) console.error(`  ${v.f}:${v.n} [${v.rule}] ${v.line}`);
  process.exit(1);
}
console.log(`UI governance guard: OK — ${files.length} feature file(s) are token-only.`);
