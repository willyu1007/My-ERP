/**
 * glossary-verify-regressions.mjs
 * Public regressions for glossary verification in ctl-context.mjs.
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';

export const name = 'context-awareness-glossary-verify-regressions';

function schemaTemplatePath(ctx) {
  return path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'context-awareness',
    'templates',
    'docs',
    'context',
    'glossary.schema.json'
  );
}

function contextPath(ctx) {
  return path.join(ctx.repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
}

function makeGlossaryFixture(ctx, sub, glossaryData) {
  const rootDir = path.join(ctx.evidenceDir, name, sub);
  const contextDir = path.join(rootDir, 'docs', 'context');
  fs.mkdirSync(path.join(contextDir, 'api'), { recursive: true });
  fs.mkdirSync(path.join(contextDir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(contextDir, 'glossary.json'), JSON.stringify(glossaryData, null, 2), 'utf8');
  const schemaSrc = schemaTemplatePath(ctx);
  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, path.join(contextDir, 'glossary.schema.json'));
  }
  fs.writeFileSync(
    path.join(contextDir, 'registry.json'),
    JSON.stringify(
      {
        version: 1,
        updatedAt: '2025-01-01T00:00:00.000Z',
        artifacts: [{ id: 'glossary', type: 'json', path: 'docs/context/glossary.json', mode: 'contract' }],
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(path.join(contextDir, 'INDEX.md'), '# Index\n', 'utf8');
  fs.writeFileSync(path.join(contextDir, 'config', 'environment-registry.json'), JSON.stringify({ version: 1, environments: [] }, null, 2), 'utf8');
  return rootDir;
}

function runGlossaryVerify(ctx, rootDir, label, strict = true) {
  const args = [contextPath(ctx), 'verify', '--repo-root', rootDir];
  if (strict) args.push('--strict');
  return runCommand({
    cmd: 'node',
    args,
    evidenceDir: path.join(ctx.evidenceDir, name),
    label,
  });
}

export function run(ctx) {
  const checks = [];
  let allPass = true;

  function check(label, fn) {
    try {
      const ok = fn();
      checks.push({ label, ok });
      if (!ok) allPass = false;
    } catch (e) {
      checks.push({ label, ok: false, error: e.message });
      allPass = false;
    }
  }

  check('glossary-verify-valid-empty', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-valid', {
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-valid', false);
    return r.code === 0;
  });

  check('glossary-verify-invalid', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-invalid', {
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [{ term: 'foo' }],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-invalid', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('definition');
  });

  check('glossary-missing-version', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-no-version', { terms: [] });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-no-version', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('version');
  });

  check('glossary-missing-terms', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-no-terms', { version: 1 });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-no-terms', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('terms');
  });

  check('glossary-wrong-version', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-wrong-ver', {
      version: 2,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-wrong-ver', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('must be 1');
  });

  check('glossary-extra-root-prop', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-extra-root', {
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [],
      extra_field: true,
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-extra-root', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('extra_field');
  });

  check('glossary-extra-item-prop', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-extra-item', {
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [{ term: 'foo', definition: 'bar', custom: 123 }],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-extra-item', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('custom');
  });

  check('glossary-aliases-item-type', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-aliases-type', {
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [{ term: 'foo', definition: 'bar', aliases: [123] }],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-aliases-type', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('string');
  });

  check('glossary-updatedAt-wrong-type', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-updatedAt-type', {
      version: 1,
      updatedAt: 123,
      terms: [],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-updatedAt-type', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('string');
  });

  check('glossary-corrupt-schema', () => {
    const rootDir = path.join(ctx.evidenceDir, name, 'glossary-corrupt-schema');
    const contextDir = path.join(rootDir, 'docs', 'context');
    fs.mkdirSync(path.join(contextDir, 'api'), { recursive: true });
    fs.mkdirSync(path.join(contextDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(contextDir, 'glossary.json'), JSON.stringify({ version: 1, terms: [] }, null, 2), 'utf8');
    fs.writeFileSync(path.join(contextDir, 'glossary.schema.json'), 'NOT VALID JSON{{{', 'utf8');
    fs.writeFileSync(
      path.join(contextDir, 'registry.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2025-01-01T00:00:00.000Z',
          artifacts: [{ id: 'glossary', type: 'json', path: 'docs/context/glossary.json', mode: 'contract' }],
        },
        null,
        2
      ),
      'utf8'
    );
    fs.writeFileSync(path.join(contextDir, 'INDEX.md'), '# Index\n', 'utf8');
    fs.writeFileSync(path.join(contextDir, 'config', 'environment-registry.json'), JSON.stringify({ version: 1, environments: [] }, null, 2), 'utf8');
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-corrupt-schema', false);
    return r.code !== 0 && (r.stdout + r.stderr).includes('failed to parse');
  });

  check('glossary-strict-fallback-catches-errors', () => {
    const rootDir = makeGlossaryFixture(ctx, 'glossary-strict-fallback', {
      version: 2,
      updatedAt: '2025-01-01T00:00:00.000Z',
      terms: [],
    });
    const r = runGlossaryVerify(ctx, rootDir, 'glossary-strict-fallback', true);
    return r.code !== 0 && (r.stdout + r.stderr).includes('must be 1');
  });

  ctx.log(`[${name}] results: ${checks.map((c) => `${c.label}=${c.ok ? 'PASS' : 'FAIL'}`).join(', ')}`);
  return {
    name,
    status: allPass ? 'PASS' : 'FAIL',
    checks,
  };
}
