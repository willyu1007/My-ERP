#!/usr/bin/env node
/**
 * ctl-db-ssot.mjs
 *
 * SSOT-aware database schema context generator.
 *
 * Goal:
 * - Provide a single, deterministic "database shape" artifact for LLMs:
 *   docs/context/db/schema.json (normalized-db-schema-v2)
 * - Support mutually-exclusive DB SSOT modes:
 *   - none         : no managed SSOT in repo
 *   - repo-prisma  : prisma/schema.prisma is SSOT (code -> db)
 *   - database     : real DB is SSOT (db -> code); repo holds mirrors
 *   - convex       : convex/schema.ts + convex function surface are SSOT
 *
 * Config (created by init pipeline):
 *   docs/project/db-ssot.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  readJsonIfExists,
  readTextIfExists,
  writeJson,
  parsePrismaSchema,
  normalizeDbMirrorSchema,
  buildNormalizedDbSchema,
  NORMALIZED_DB_SCHEMA_VERSION
} from './lib/normalized-db-schema.mjs';


function stableStringifyForCompare(value) {
  const seen = new WeakSet();
  function normalize(v) {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      if (Array.isArray(v)) return v.map(normalize);
      const out = {};
      for (const k of Object.keys(v).sort()) {
        out[k] = normalize(v[k]);
      }
      return out;
    }
    return v;
  }
  return JSON.stringify(normalize(value));
}

function withoutUpdatedAt(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = { ...obj };
  delete copy.updatedAt;
  return copy;
}

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/ctl-db-ssot.mjs <command> [options]

Commands:
  help
    Show this help.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show resolved DB SSOT mode and source paths.

  sync-to-context
    --repo-root <path>          Repo root (default: cwd)
    --out <path>                Output path (fixed to docs/context/db/schema.json in v1)
    --format <text|json>        Output format (default: text)
    Generate/update the normalized DB schema contract for LLMs.

Notes:
- This script is safe to run in CI.
- It never requires DB credentials. For DB SSOT mode it reads repo mirrors.
- Managed DB contract paths are fixed in v1; custom output paths are not part of the public interface.
- Convex mode may repoint the schema source via \`docs/project/db-ssot.json\` (\`db.source.path\`).
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

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function resolvePath(base, p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(base, p);
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isPathWithinRepo(repoRoot, targetPath) {
  const rel = path.relative(path.resolve(repoRoot), path.resolve(targetPath));
  if (!rel) return true;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

const CANONICAL_PATHS = Object.freeze({
  prismaSchema: 'prisma/schema.prisma',
  dbMirror: 'db/schema/tables.json',
  contextContract: 'docs/context/db/schema.json',
  convexSchema: 'convex/schema.ts',
  convexFunctions: 'docs/context/convex/functions.json'
});

function firstConfiguredPath(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return toPosix(value.trim());
    }
  }
  return '';
}

function resolveConfiguredPaths(raw, mode) {
  const paths = { ...CANONICAL_PATHS };
  if (!raw || typeof raw !== 'object') return paths;

  if (mode === 'convex') {
    const configuredSchema = firstConfiguredPath(
      raw?.db?.source?.path,
      raw?.paths?.convexSchema
    );
    if (configuredSchema) {
      paths.convexSchema = configuredSchema;
    }
  }

  return paths;
}

function collectConfiguredPathErrors(repoRoot, paths, mode) {
  const errors = [];
  if (mode === 'convex') {
    const schemaPath = resolvePath(repoRoot, paths?.convexSchema || CANONICAL_PATHS.convexSchema);
    if (!schemaPath || !isPathWithinRepo(repoRoot, schemaPath)) {
      errors.push(`Configured Convex schema path resolves outside repo root: ${paths?.convexSchema || CANONICAL_PATHS.convexSchema}`);
    }
  }
  return errors;
}

function collectUnsupportedPathWarnings(raw, mode) {
  if (!raw || typeof raw !== 'object') return [];

  const warnings = [];
  const compare = (label, value, expected) => {
    const actual = typeof value === 'string' ? value.trim() : '';
    if (actual && expected && actual !== expected) {
      warnings.push(`${label}=${actual} is ignored in v1; managed DB paths are fixed to ${expected}.`);
    }
  };

  compare('paths.prismaSchema', raw?.paths?.prismaSchema, CANONICAL_PATHS.prismaSchema);
  compare('paths.dbSchemaTables', raw?.paths?.dbSchemaTables, CANONICAL_PATHS.dbMirror);
  compare('paths.dbContextContract', raw?.paths?.dbContextContract, CANONICAL_PATHS.contextContract);
  compare('paths.convexFunctionsContract', raw?.paths?.convexFunctionsContract, CANONICAL_PATHS.convexFunctions);
  compare('db.contracts.dbSchema', raw?.db?.contracts?.dbSchema, CANONICAL_PATHS.contextContract);
  compare('db.contracts.convexFunctions', raw?.db?.contracts?.convexFunctions, CANONICAL_PATHS.convexFunctions);

  if (mode === 'repo-prisma') compare('db.source.path', raw?.db?.source?.path, CANONICAL_PATHS.prismaSchema);
  if (mode === 'database') compare('db.source.path', raw?.db?.source?.path, CANONICAL_PATHS.dbMirror);

  return warnings;
}

function loadDbSsotConfig(repoRoot) {
  const configPath = path.join(repoRoot, 'docs', 'project', 'db-ssot.json');
  const raw = readJsonIfExists(configPath);
  if (!raw) return { path: configPath, config: null };

  const ssot = raw?.db?.ssot || raw?.ssot || raw?.mode;
  const mode =
    typeof ssot === 'string'
      ? ssot.trim()
      : ssot && typeof ssot === 'object' && typeof ssot.mode === 'string'
        ? ssot.mode.trim()
        : '';
  const paths = resolveConfiguredPaths(raw, mode);
  return {
    path: configPath,
    config: raw,
    mode,
    paths,
    warnings: collectUnsupportedPathWarnings(raw, mode),
    errors: collectConfiguredPathErrors(repoRoot, paths, mode)
  };
}

function inferMode(repoRoot) {
  const convexSchema = path.join(repoRoot, 'convex', 'schema.ts');
  const prismaSchema = path.join(repoRoot, 'prisma', 'schema.prisma');
  const dbMirror = path.join(repoRoot, 'db', 'schema', 'tables.json');

  if (exists(convexSchema)) return 'convex';
  if (exists(prismaSchema)) return 'repo-prisma';
  if (exists(dbMirror)) return 'database';
  return 'none';
}

function resolveMode(repoRoot) {
  const { path: configPath, config, mode: configuredMode } = loadDbSsotConfig(repoRoot);

  const supported = new Set(['none', 'repo-prisma', 'database', 'convex']);

  if (configuredMode && supported.has(configuredMode)) {
    return {
      mode: configuredMode,
      source: 'config',
      configPath,
      config
    };
  }

  return {
    mode: inferMode(repoRoot),
    source: configuredMode ? 'infer (invalid config)' : 'infer (no config)',
    configPath,
    config
  };
}

function buildContractFromPrisma({ repoRoot, mode }) {
  const prismaPath = path.join(repoRoot, 'prisma', 'schema.prisma');
  const prismaText = readTextIfExists(prismaPath);

  if (!prismaText) {
    return {
      contract: buildNormalizedDbSchema({
        mode,
        source: { kind: 'prisma-schema', path: toPosix(path.relative(repoRoot, prismaPath)) },
        database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
        enums: [],
        tables: [],
        notes: `Missing prisma schema at ${toPosix(path.relative(repoRoot, prismaPath))}. Create it, then re-run ctl-db-ssot.`
      }),
      warnings: [`Missing Prisma schema: ${toPosix(path.relative(repoRoot, prismaPath))}`]
    };
  }

  const parsed = parsePrismaSchema(prismaText);
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings : [];
  return {
    contract: buildNormalizedDbSchema({
      mode,
      source: { kind: 'prisma-schema', path: toPosix(path.relative(repoRoot, prismaPath)) },
      database: parsed.database,
      enums: parsed.enums,
      tables: parsed.tables,
      notes: `Generated from Prisma schema.prisma (SSOT: ${mode}).`
    }),
    warnings
  };
}

function buildContractFromDbMirror({ repoRoot, mode }) {
  const mirrorPath = path.join(repoRoot, 'db', 'schema', 'tables.json');
  const raw = readJsonIfExists(mirrorPath);

  if (!raw) {
    return {
      contract: buildNormalizedDbSchema({
        mode,
        source: { kind: 'db-mirror', path: toPosix(path.relative(repoRoot, mirrorPath)) },
        database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
        enums: [],
        tables: [],
        notes: `Missing DB mirror at ${toPosix(path.relative(repoRoot, mirrorPath))}. Initialize db-mirror and import schema, then re-run ctl-db-ssot.`
      }),
      warnings: [`Missing DB mirror: ${toPosix(path.relative(repoRoot, mirrorPath))}`]
    };
  }

  const normalized = normalizeDbMirrorSchema(raw);

  // Ensure ssot.mode matches current mode.
  normalized.ssot = normalized.ssot || { mode, source: { kind: 'db-mirror', path: '' } };
  normalized.ssot.mode = mode;
  normalized.ssot.source = normalized.ssot.source || { kind: 'db-mirror', path: '' };
  normalized.ssot.source.kind = normalized.ssot.source.kind || 'db-mirror';
  normalized.ssot.source.path = normalized.ssot.source.path || toPosix(path.relative(repoRoot, mirrorPath));

  normalized.notes = normalized.notes || `Mirrored from real DB via repo artifacts (SSOT: ${mode}).`;

  return { contract: normalized, warnings: [] };
}

function buildContractNone({ repoRoot }) {
  return {
    contract: buildNormalizedDbSchema({
      mode: 'none',
      source: { kind: 'none', path: '' },
      database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
      enums: [],
      tables: [],
      notes: 'DB SSOT mode is "none". This contract is intentionally empty.'
    }),
    warnings: []
  };
}

function getConvexCtlPath(repoRoot) {
  return path.join(repoRoot, '.ai', 'skills', 'features', 'database', 'convex-as-ssot', 'scripts', 'ctl-convex.mjs');
}

function runConvexCtl(repoRoot, args) {
  const ctlPath = getConvexCtlPath(repoRoot);
  if (!exists(ctlPath)) {
    die(`[error] Convex DB SSOT controller not found: ${toPosix(path.relative(repoRoot, ctlPath))}`);
  }

  const res = spawnSync('node', [ctlPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (res.status !== 0) {
    const stderr = String(res.stderr || '').trim();
    const stdout = String(res.stdout || '').trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');
    die(`[error] Convex DB SSOT delegation failed.${details ? `\n${details}` : ''}`);
  }

  return {
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || '')
  };
}

function runContextTouch(repoRoot) {
  const contextctl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
  if (!exists(contextctl)) return { ran: false, reason: 'ctl-context.mjs not found' };

  const res = spawnSync('node', [contextctl, 'touch', '--repo-root', repoRoot], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (res.status !== 0) {
    return { ran: true, ok: false, exitCode: res.status };
  }

  return { ran: true, ok: true };
}

function cmdStatus(repoRoot, format) {
  const resolved = resolveMode(repoRoot);
  const cfg = loadDbSsotConfig(repoRoot);
  const paths = cfg.paths || { ...CANONICAL_PATHS };
  const prismaPath = path.join(repoRoot, paths.prismaSchema);
  const mirrorPath = path.join(repoRoot, paths.dbMirror);
  const outPath = path.join(repoRoot, paths.contextContract);
  const convexSchemaPath = path.join(repoRoot, paths.convexSchema);
  const convexFunctionsPath = path.join(repoRoot, paths.convexFunctions);

  const status = {
    mode: resolved.mode,
    source: resolved.source,
    configPath: toPosix(path.relative(repoRoot, resolved.configPath)),
    paths: {
      prismaSchema: toPosix(path.relative(repoRoot, prismaPath)),
      dbMirror: toPosix(path.relative(repoRoot, mirrorPath)),
      contextContract: toPosix(path.relative(repoRoot, outPath)),
      convexSchema: toPosix(path.relative(repoRoot, convexSchemaPath)),
      convexFunctions: toPosix(path.relative(repoRoot, convexFunctionsPath))
    },
    exists: {
      prismaSchema: exists(prismaPath),
      dbMirror: exists(mirrorPath),
      contextContract: exists(outPath),
      convexSchema: exists(convexSchemaPath),
      convexFunctions: exists(convexFunctionsPath)
    },
    errors: cfg.errors || [],
    warnings: cfg.warnings || []
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('DB SSOT Status');
  console.log('');
  console.log(`  Mode:   ${status.mode}`);
  console.log(`  Source: ${status.source}`);
  console.log(`  Config: ${status.configPath} (${exists(resolved.configPath) ? 'present' : 'missing'})`);
  console.log('');
  console.log('  Key paths:');
  console.log(`    - Prisma schema:   ${status.paths.prismaSchema} (${status.exists.prismaSchema ? 'present' : 'missing'})`);
  console.log(`    - DB mirror:       ${status.paths.dbMirror} (${status.exists.dbMirror ? 'present' : 'missing'})`);
  console.log(`    - Context contract:${status.paths.contextContract} (${status.exists.contextContract ? 'present' : 'missing'})`);
  console.log(`    - Convex schema:   ${status.paths.convexSchema} (${status.exists.convexSchema ? 'present' : 'missing'})`);
  console.log(`    - Convex functions:${status.paths.convexFunctions} (${status.exists.convexFunctions ? 'present' : 'missing'})`);
  if (status.errors.length > 0) {
    for (const error of status.errors) console.error(`[error] ${error}`);
  }
  if (status.warnings.length > 0) {
    for (const warning of status.warnings) console.warn(`[warn] ${warning}`);
  }
}

function cmdSyncToContext(repoRoot, outPath, format) {
  const resolved = resolveMode(repoRoot);
  const cfg = loadDbSsotConfig(repoRoot);
  const paths = cfg.paths || { ...CANONICAL_PATHS };
  if (cfg.errors && cfg.errors.length > 0) {
    die(`[error] Invalid DB SSOT config.\n${cfg.errors.map((error) => `- ${error}`).join('\n')}`);
  }
  if (outPath) {
    const requestedOut = resolvePath(repoRoot, outPath);
    const requestedRel = toPosix(path.relative(repoRoot, requestedOut));
    if (requestedRel !== CANONICAL_PATHS.contextContract) {
      die(`[error] ctl-db-ssot v1 uses fixed output path ${CANONICAL_PATHS.contextContract}; custom --out is not supported.`);
    }
  }
  const outputPath = resolvePath(repoRoot, CANONICAL_PATHS.contextContract);
  if (!outputPath) die('[error] Failed to resolve canonical output path');

  let built = null;
  let delegatedConvex = null;
  if (resolved.mode === 'repo-prisma') {
    built = buildContractFromPrisma({ repoRoot, mode: 'repo-prisma' });
  } else if (resolved.mode === 'database') {
    built = buildContractFromDbMirror({ repoRoot, mode: 'database' });
  } else if (resolved.mode === 'convex') {
    const schemaPath = resolvePath(repoRoot, paths.convexSchema);
    const fnOut = resolvePath(repoRoot, CANONICAL_PATHS.convexFunctions);
    delegatedConvex = {
      schema: toPosix(path.relative(repoRoot, schemaPath)),
      fnOut: toPosix(path.relative(repoRoot, fnOut))
    };
    runConvexCtl(repoRoot, [
      'sync-to-context',
      '--repo-root',
      repoRoot,
      '--schema-path',
      schemaPath,
      '--db-out',
      outputPath,
      '--fn-out',
      fnOut,
      '--internal-caller',
      'ctl-db-ssot'
    ]);
  } else {
    built = buildContractNone({ repoRoot });
  }

  if (built) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    if (built.contract.version !== NORMALIZED_DB_SCHEMA_VERSION) {
      built.contract.version = NORMALIZED_DB_SCHEMA_VERSION;
    }

    const existing = readJsonIfExists(outputPath);
    if (existing && typeof existing === 'object') {
      const a = stableStringifyForCompare(withoutUpdatedAt(existing));
      const b = stableStringifyForCompare(withoutUpdatedAt(built.contract));
      if (a === b && typeof existing.updatedAt === 'string' && existing.updatedAt) {
        built.contract.updatedAt = existing.updatedAt;
      }
    }

    writeJson(outputPath, built.contract);
  }

  const touchRes = runContextTouch(repoRoot);

  const result = {
    ok: true,
    mode: resolved.mode,
    out: toPosix(path.relative(repoRoot, outputPath)),
    ...(delegatedConvex ? { convexFunctions: delegatedConvex.fnOut } : {}),
    warnings: [...(cfg.warnings || []), ...(built ? built.warnings : [])],
    contextTouch: touchRes
  };

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('[ok] Context DB contract updated.');
  console.log(`  - Mode: ${resolved.mode}`);
  console.log(`  - Out:  ${result.out}`);
  if (result.convexFunctions) {
    console.log(`  - Convex schema: ${delegatedConvex.schema}`);
    console.log(`  - Convex functions: ${result.convexFunctions}`);
  }
  if (result.warnings && result.warnings.length > 0) {
    for (const w of result.warnings) console.warn(`[warn] ${w}`);
  }
  if (touchRes.ran) {
    console.log(`  - ctl-context touch: ${touchRes.ok ? 'ok' : `failed (exit ${touchRes.exitCode})`}`);
  } else {
    console.log(`  - ctl-context touch: skipped (${touchRes.reason})`);
  }
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = String(opts['format'] || 'text').toLowerCase();
  const out = opts['out'];

  if (command === 'help') usage(0);
  if (command === 'status') return cmdStatus(repoRoot, format);
  if (command === 'sync-to-context') return cmdSyncToContext(repoRoot, out, format);

  usage(1);
}

main();
