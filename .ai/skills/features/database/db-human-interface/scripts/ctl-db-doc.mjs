#!/usr/bin/env node
/**
 * ctl-db-doc.mjs
 *
 * Human-friendly DB structure query + interactive change drafting on top of
 * the unified normalized DB schema contract (v2).
 *
 * Outputs:
 *   - Query:  .ai/.tmp/database/structure_query/<object>.md
 *   - Modify: .ai/.tmp/database/structure_modify/<object>.md
 *            + .plan.md
 *            + .runbook.md (only for db.ssot=database)
 *
 * Boundaries:
 *   - Does NOT run prisma migrate.
 *   - Does NOT connect to or modify a real DB.
 *   - Hands off execution to existing DB SSOT workflow skills.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXIT = {
  OK: 0,
  USAGE: 2,
  FAILED: 1
};

function toIsoNow() {
  return new Date().toISOString();
}

function repoRootFromScript(repoRootOpt = null) {
  if (repoRootOpt) {
    return path.resolve(String(repoRootOpt));
  }

  // Resolve repo root by walking up until we find a ".ai/" directory.
  // This keeps the script runnable from its skill-local location.
  const starts = [path.resolve(__dirname), path.resolve(process.cwd())];
  for (const start of starts) {
    let cur = start;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const aiDir = path.join(cur, '.ai');
      try {
        if (fs.statSync(aiDir).isDirectory()) return cur;
      } catch {}
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  return path.resolve(process.cwd());
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

function safeSlug(s) {
  const raw = String(s || '').trim();
  if (!raw) return 'unknown';
  // Keep alnum, dash, underscore, dot; replace others with '-'.
  const cleaned = raw
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'unknown';
}

function normalizeOptKey(k) {
  return String(k || '')
    .trim()
    .replace(/^--+/, '')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseTermAndOpts(args) {
  const opts = {};
  const terms = [];
  const a = Array.isArray(args) ? args : [];

  for (let i = 0; i < a.length; i += 1) {
    const token = String(a[i] || '');
    if (!token.startsWith('--')) {
      terms.push(token);
      continue;
    }

    let key = token;
    let value = true;

    // --key=value
    const eq = token.indexOf('=');
    if (eq >= 0) {
      key = token.slice(0, eq);
      value = token.slice(eq + 1);
    } else {
      // --key value
      const next = i + 1 < a.length ? String(a[i + 1] || '') : '';
      if (next && !next.startsWith('--')) {
        value = next;
        i += 1;
      }
    }

    key = normalizeOptKey(key);
    opts[key] = value;
  }

  return {
    term: terms.join(' ').trim(),
    opts
  };
}

function optStr(opts, key, def) {
  const k = normalizeOptKey(key);
  const v = opts && Object.prototype.hasOwnProperty.call(opts, k) ? opts[k] : undefined;
  if (v === undefined || v === null || v === true) return def;
  return String(v).trim() || def;
}

function optInt(opts, key, def) {
  const s = optStr(opts, key, '');
  if (!s) return def;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : def;
}

function splitTokens(s) {
  const raw = String(s || '');
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-\.]+/g, ' ')
    .toLowerCase();
  return spaced
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeKey(s) {
  return splitTokens(s).join(' ');
}

function compactKey(s) {
  return splitTokens(s).join('');
}

const CANONICAL_SSOT_PATHS = Object.freeze({
  prismaSchema: 'prisma/schema.prisma',
  dbSchemaTables: 'db/schema/tables.json',
  dbContextContract: 'docs/context/db/schema.json',
  convexSchema: 'convex/schema.ts',
  convexFunctionsContract: 'docs/context/convex/functions.json'
});

function collectUnsupportedSsotPathWarnings(cfg, mode) {
  if (!cfg || typeof cfg !== 'object') return [];

  const warnings = [];
  const compare = (label, value, expected) => {
    const actual = typeof value === 'string' ? value.trim() : '';
    if (actual && expected && actual !== expected) {
      warnings.push(`${label}=${actual} is ignored in v1; database contracts use canonical path ${expected}.`);
    }
  };

  compare('paths.prismaSchema', cfg?.paths?.prismaSchema, CANONICAL_SSOT_PATHS.prismaSchema);
  compare('paths.dbSchemaTables', cfg?.paths?.dbSchemaTables, CANONICAL_SSOT_PATHS.dbSchemaTables);
  compare('paths.dbContextContract', cfg?.paths?.dbContextContract, CANONICAL_SSOT_PATHS.dbContextContract);
  compare('paths.convexSchema', cfg?.paths?.convexSchema, CANONICAL_SSOT_PATHS.convexSchema);
  compare('paths.convexFunctionsContract', cfg?.paths?.convexFunctionsContract, CANONICAL_SSOT_PATHS.convexFunctionsContract);
  compare('db.contracts.dbSchema', cfg?.db?.contracts?.dbSchema, CANONICAL_SSOT_PATHS.dbContextContract);
  compare('db.contracts.convexFunctions', cfg?.db?.contracts?.convexFunctions, CANONICAL_SSOT_PATHS.convexFunctionsContract);

  if (mode === 'repo-prisma') compare('db.source.path', cfg?.db?.source?.path, CANONICAL_SSOT_PATHS.prismaSchema);
  if (mode === 'database') compare('db.source.path', cfg?.db?.source?.path, CANONICAL_SSOT_PATHS.dbSchemaTables);
  if (mode === 'convex') compare('db.source.path', cfg?.db?.source?.path, CANONICAL_SSOT_PATHS.convexSchema);

  return warnings;
}

function loadSsotConfig(repoRoot) {
  const defaultCfg = {
    mode: 'none',
    paths: { ...CANONICAL_SSOT_PATHS },
    warnings: [],
    sourcePath: null
  };

  const cfgPath = path.join(repoRoot, 'docs', 'project', 'db-ssot.json');
  if (!exists(cfgPath)) return defaultCfg;

  try {
    const cfg = readJson(cfgPath);
    const mode = String(cfg.mode || cfg?.db?.ssot || cfg.ssot || cfg.dbSsot || 'none');
    return {
      mode,
      paths: { ...CANONICAL_SSOT_PATHS },
      warnings: collectUnsupportedSsotPathWarnings(cfg, mode),
      sourcePath: cfgPath
    };
  } catch {
    return defaultCfg;
  }
}

function inferSsotMode({ cfgMode, schema, mirrorExists, prismaExists, convexExists }) {
  const m = String(cfgMode || '').trim();
  if (m === 'repo-prisma' || m === 'database' || m === 'convex' || m === 'none') return m;

  const fromSchema = schema && schema.ssot && schema.ssot.mode ? String(schema.ssot.mode) : '';
  if (fromSchema === 'repo-prisma' || fromSchema === 'database' || fromSchema === 'convex' || fromSchema === 'none') return fromSchema;

  if (convexExists) return 'convex';
  if (mirrorExists) return 'database';
  if (prismaExists) return 'repo-prisma';
  return 'none';
}

function upgradeMirrorV1ToV2(raw) {
  // Very small compatibility shim for legacy v1 mirror format.
  // v1: { version: 1, tables: [{name, columns:[{name,type,constraints:[]}]}] }
  const obj = raw && typeof raw === 'object' ? raw : {};
  const tablesV1 = Array.isArray(obj.tables) ? obj.tables : [];

  function constraintsToFlags(constraints) {
    const c = Array.isArray(constraints) ? constraints.map((x) => String(x).toLowerCase()) : [];
    return {
      primaryKey: c.includes('pk') || c.includes('primary') || c.includes('primarykey'),
      unique: c.includes('unique'),
      nullable: c.includes('notnull') || c.includes('not-null') || c.includes('required') ? false : c.includes('nullable') || c.includes('null') ? true : undefined
    };
  }

  const tables = tablesV1
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const cols = Array.isArray(t.columns) ? t.columns : [];
      const columns = cols
        .filter((c) => c && typeof c === 'object')
        .map((c) => {
          const flags = constraintsToFlags(c.constraints);
          return {
            name: String(c.name || '').trim(),
            type: String(c.type || '').trim(),
            nullable: flags.nullable,
            list: false,
            dbName: null,
            dbType: null,
            default: null,
            primaryKey: flags.primaryKey,
            unique: flags.unique,
            constraints: Array.isArray(c.constraints) ? c.constraints : []
          };
        })
        .filter((c) => c.name);

      return {
        name: String(t.name || '').trim(),
        dbName: t.dbName || null,
        schema: t.schema || null,
        columns,
        relations: [],
        indexes: []
      };
    })
    .filter((t) => t.name);

  return {
    version: 2,
    updatedAt: obj.updatedAt || obj.lastUpdated || toIsoNow(),
    ssot: { mode: 'database', source: { kind: 'database', path: '' } },
    database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
    enums: [],
    tables,
    notes: obj.notes || 'Upgraded from legacy db/schema/tables.json v1.'
  };
}

function tryRunDbssotctl(repoRoot) {
  const dbssotctl = path.join(repoRoot, '.ai', 'scripts', 'ctl-db-ssot.mjs');
  if (!exists(dbssotctl)) return { ran: false, ok: false, note: 'ctl-db-ssot.mjs not found' };

  const res = spawnSync(process.execPath, [dbssotctl, 'sync-to-context'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  const ok = res.status === 0;
  return {
    ran: true,
    ok,
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function loadNormalizedSchema(repoRoot, ssotCfg) {
  const contractPath = path.join(repoRoot, ssotCfg.paths.dbContextContract);
  const mirrorPath = path.join(repoRoot, ssotCfg.paths.dbSchemaTables);
  const prismaPath = path.join(repoRoot, ssotCfg.paths.prismaSchema);
  const convexPath = path.join(repoRoot, ssotCfg.paths.convexSchema);

  // 1) Preferred: contract
  if (exists(contractPath)) {
    const schema = readJson(contractPath);
    return { schema, sourceKind: 'contract', sourcePath: contractPath, mirrorPath, prismaPath };
  }

  // 2) Attempt to generate contract via ctl-db-ssot
  const gen = tryRunDbssotctl(repoRoot);
  if (exists(contractPath)) {
    const schema = readJson(contractPath);
    return { schema, sourceKind: 'contract', sourcePath: contractPath, mirrorPath, prismaPath, generation: gen };
  }

  // 3) Fallback: mirror
  if (exists(mirrorPath)) {
    const raw = readJson(mirrorPath);
    const version = Number(raw && raw.version) || 1;
    const schema = version >= 2 ? raw : upgradeMirrorV1ToV2(raw);
    return { schema, sourceKind: 'mirror', sourcePath: mirrorPath, mirrorPath, prismaPath, generation: gen };
  }

  // 4) Last resort: Convex schema exists but no generator/contract.
  if (exists(convexPath)) {
    return {
      schema: null,
      sourceKind: 'missing',
      sourcePath: null,
      mirrorPath,
      prismaPath,
      generation: gen,
      error: `No normalized contract found at ${ssotCfg.paths.dbContextContract}.\n` +
        `Found ${ssotCfg.paths.convexSchema} but could not generate contract.\n` +
        `Run: node .ai/scripts/ctl-db-ssot.mjs sync-to-context (delegates to Convex tooling when configured).`
    };
  }

  // 5) Last resort: prisma schema exists but no generator/contract.
  if (exists(prismaPath)) {
    return {
      schema: null,
      sourceKind: 'missing',
      sourcePath: null,
      mirrorPath,
      prismaPath,
      generation: gen,
      error: `No normalized contract found at ${ssotCfg.paths.dbContextContract}.\n` +
        `Found ${ssotCfg.paths.prismaSchema} but could not generate contract.\n` +
        `Run: node .ai/scripts/ctl-db-ssot.mjs sync-to-context (requires template scripts).`
    };
  }

  return {
    schema: null,
    sourceKind: 'missing',
    sourcePath: null,
    mirrorPath,
    prismaPath,
    generation: gen,
    error:
      `No DB schema sources found. Expected one of:\n` +
      `- ${ssotCfg.paths.dbContextContract} (preferred)\n` +
      `- ${ssotCfg.paths.dbSchemaTables}\n` +
      `- ${ssotCfg.paths.prismaSchema}\n` +
      `- ${ssotCfg.paths.convexSchema}`
  };
}

function loadConvexFunctionsContract(repoRoot, ssotCfg, priorGeneration = null) {
  const contractPath = path.join(repoRoot, ssotCfg.paths.convexFunctionsContract);
  const convexPath = path.join(repoRoot, ssotCfg.paths.convexSchema);

  if (exists(contractPath)) {
    const contract = readJson(contractPath);
    return { contract, sourceKind: 'contract', sourcePath: contractPath, generation: priorGeneration };
  }

  const gen = priorGeneration && priorGeneration.ran ? priorGeneration : tryRunDbssotctl(repoRoot);
  if (exists(contractPath)) {
    const contract = readJson(contractPath);
    return { contract, sourceKind: 'contract', sourcePath: contractPath, generation: gen };
  }

  if (exists(convexPath)) {
    return {
      contract: null,
      sourceKind: 'missing',
      sourcePath: null,
      generation: gen,
      error: `No Convex function contract found at ${ssotCfg.paths.convexFunctionsContract}.\n` +
        `Found ${ssotCfg.paths.convexSchema} but could not generate the function surface.\n` +
        `Run: node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
    };
  }

  return {
    contract: null,
    sourceKind: 'missing',
    sourcePath: null,
    generation: gen,
    error:
      `No Convex function sources found. Expected one of:\n` +
      `- ${ssotCfg.paths.convexFunctionsContract} (preferred)\n` +
      `- ${ssotCfg.paths.convexSchema}`
  };
}

function loadConvexSurface(repoRoot, ssotCfg) {
  const db = loadNormalizedSchema(repoRoot, ssotCfg);
  const functions = loadConvexFunctionsContract(repoRoot, ssotCfg, db.generation || null);
  return { db, functions };
}

function buildIndex(schema) {
  const idx = {
    tables: Array.isArray(schema?.tables) ? schema.tables : [],
    enums: Array.isArray(schema?.enums) ? schema.enums : [],
    tablesByLower: new Map(),
    enumsByLower: new Map(),
    columnsByLower: new Map() // colName -> [{ table, column }]
  };

  for (const t of idx.tables) {
    if (!t || typeof t !== 'object') continue;
    const name = String(t.name || '');
    if (!name) continue;
    idx.tablesByLower.set(normalizeKey(name), t);
    const cols = Array.isArray(t.columns) ? t.columns : [];
    for (const c of cols) {
      if (!c || typeof c !== 'object') continue;
      const cn = String(c.name || '');
      if (!cn) continue;
      const key = normalizeKey(cn);
      if (!idx.columnsByLower.has(key)) idx.columnsByLower.set(key, []);
      idx.columnsByLower.get(key).push({ table: t, column: c });
    }
  }

  for (const e of idx.enums) {
    if (!e || typeof e !== 'object') continue;
    const name = String(e.name || '');
    if (!name) continue;
    idx.enumsByLower.set(normalizeKey(name), e);
  }

  return idx;
}

function appendMapList(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function buildFunctionIndex(contract) {
  const functions = Array.isArray(contract?.functions)
    ? contract.functions.filter((fn) => fn && typeof fn === 'object')
    : [];
  const idx = {
    functions,
    byFunctionId: new Map(),
    byExportName: new Map(),
    byModulePath: new Map()
  };

  for (const fn of functions) {
    const functionIdKey = normalizeKey(fn.functionId || '');
    const exportKey = normalizeKey(fn.exportName || '');
    const moduleKey = normalizeKey(fn.modulePath || '');
    if (functionIdKey) idx.byFunctionId.set(functionIdKey, fn);
    appendMapList(idx.byExportName, exportKey, fn);
    appendMapList(idx.byModulePath, moduleKey, fn);
  }

  return idx;
}

function hasConvexFunctionIndex(functionIndex) {
  return !!(functionIndex && Array.isArray(functionIndex.functions));
}

function scoreFunctionCandidate(fn, term) {
  const qNorm = normalizeKey(term);
  const qCompact = compactKey(term);
  if (!qNorm) return 0;

  const functionId = String(fn.functionId || '');
  const exportName = String(fn.exportName || '');
  const modulePath = String(fn.modulePath || fn.file || '');
  const kind = String(fn.kind || '');
  const visibility = String(fn.visibility || '');
  const authKind = String(fn?.auth?.kind || '');
  const tablesRead = Array.isArray(fn.tablesRead) ? fn.tablesRead : [];
  const tablesWritten = Array.isArray(fn.tablesWritten) ? fn.tablesWritten : [];

  if (normalizeKey(functionId) === qNorm) return 1;
  if (normalizeKey(exportName) === qNorm) return 0.98;
  if (normalizeKey(modulePath) === qNorm || compactKey(modulePath) === qCompact) return 0.96;
  if (tablesRead.some((name) => normalizeKey(name) === qNorm) || tablesWritten.some((name) => normalizeKey(name) === qNorm)) return 0.94;
  if (normalizeKey(kind) === qNorm) return 0.9;
  if (normalizeKey(visibility) === qNorm || normalizeKey(authKind) === qNorm) return 0.88;

  let score = 0;
  score = Math.max(score, scoreNameMatch(functionId, term));
  score = Math.max(score, Math.max(0, scoreNameMatch(exportName, term) - 0.01));
  score = Math.max(score, Math.max(0, scoreNameMatch(modulePath, term) - 0.03));
  score = Math.max(score, Math.max(0, scoreNameMatch(kind, term) - 0.08));
  score = Math.max(score, Math.max(0, scoreNameMatch(visibility, term) - 0.1));
  score = Math.max(score, Math.max(0, scoreNameMatch(authKind, term) - 0.1));

  for (const tableName of tablesRead) {
    score = Math.max(score, Math.max(0, scoreNameMatch(tableName, term) - 0.04));
  }
  for (const tableName of tablesWritten) {
    score = Math.max(score, Math.max(0, scoreNameMatch(tableName, term) - 0.04));
  }

  return Number(score.toFixed(2));
}

function searchFunctionCandidates(functionIndex, term, limit = 10) {
  if (!hasConvexFunctionIndex(functionIndex)) return [];

  const out = [];
  for (const fn of functionIndex.functions) {
    const score = scoreFunctionCandidate(fn, term);
    if (score <= 0) continue;
    out.push({
      kind: 'function',
      name: String(fn.functionId || fn.exportName || 'unknown'),
      score,
      fn
    });
  }

  out.sort((a, b) => (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
  return out.slice(0, limit);
}

function resolveFunctionForQuery(functionIndex, term) {
  const q = String(term || '').trim();
  const qKey = normalizeKey(q);
  if (!qKey || !hasConvexFunctionIndex(functionIndex)) {
    return { kind: 'none', term: q, candidates: [] };
  }

  const exactById = functionIndex.byFunctionId.get(qKey);
  if (exactById) return { kind: 'function', fn: exactById, term: q, candidates: [{ kind: 'function', name: exactById.functionId, score: 1, fn: exactById }] };

  const exactByExport = functionIndex.byExportName.get(qKey) || [];
  if (exactByExport.length === 1) {
    return { kind: 'function', fn: exactByExport[0], term: q, candidates: [{ kind: 'function', name: exactByExport[0].functionId, score: 0.98, fn: exactByExport[0] }] };
  }

  const exactByModule = functionIndex.byModulePath.get(qKey) || [];
  if (exactByModule.length === 1) {
    return { kind: 'function', fn: exactByModule[0], term: q, candidates: [{ kind: 'function', name: exactByModule[0].functionId, score: 0.96, fn: exactByModule[0] }] };
  }

  const candidates = searchFunctionCandidates(functionIndex, q, 10);
  if (!candidates.length) return { kind: 'search', term: q, candidates: [] };

  const [top] = candidates;
  const tied = candidates.filter((candidate) => candidate.score === top.score);
  if (top.score >= 0.9 && tied.length === 1) {
    return { kind: 'function', fn: top.fn, term: q, candidates };
  }

  return { kind: 'search', term: q, candidates };
}

function buildGraphIndex(idx) {
  // Builds a light relationship graph over normalized schema relations.
  // outgoing: tableLower -> edges[{from,to,field,optional,list,relationName}]
  // incoming: tableLower -> edges[...] (edges pointing *to* that table)
  const outgoing = new Map();
  const incoming = new Map();

  for (const t of idx.tables) {
    if (!t || typeof t !== 'object') continue;
    const fromName = String(t.name || '').trim();
    if (!fromName) continue;
    const fromKey = normalizeKey(fromName);

    const rels = Array.isArray(t.relations) ? t.relations : [];
    for (const r of rels) {
      if (!r || typeof r !== 'object') continue;
      const toName = String(r.to || '').trim();
      if (!toName) continue;
      const toKey = normalizeKey(toName);

      const edge = {
        from: fromName,
        to: toName,
        field: String(r.field || '').trim(),
        optional: r.optional === true,
        list: r.list === true,
        relationName: String(r.relationName || '').trim()
      };

      if (!outgoing.has(fromKey)) outgoing.set(fromKey, []);
      outgoing.get(fromKey).push(edge);

      if (!incoming.has(toKey)) incoming.set(toKey, []);
      incoming.get(toKey).push(edge);
    }
  }

  return { outgoing, incoming };
}

function neighborsOf(graph, tableName) {
  const key = normalizeKey(tableName);
  const set = new Set();

  const out = graph.outgoing.get(key) || [];
  for (const e of out) set.add(normalizeKey(e.to));

  const inc = graph.incoming.get(key) || [];
  for (const e of inc) set.add(normalizeKey(e.from));

  return Array.from(set);
}

function isJoinTableCandidate(table) {
  const cols = Array.isArray(table?.columns) ? table.columns : [];
  const rels = Array.isArray(table?.relations) ? table.relations : [];
  const idxs = Array.isArray(table?.indexes) ? table.indexes : [];

  if (rels.length < 2) return false;
  if (cols.length > 10) return false;

  // Heuristic: small table + multiple relations + composite unique/index.
  const composite = idxs.some((i) => {
    const fields = Array.isArray(i?.fields) ? i.fields : Array.isArray(i?.columns) ? i.columns : [];
    if (fields.length < 2) return false;
    const t = String(i?.type || '').toLowerCase();
    return t === 'unique' || t === 'primary' || t === 'index';
  });

  return composite;
}

function tablesUsingEnum(idx, enumName) {
  const out = [];
  const key = normalizeKey(enumName);
  for (const t of idx.tables) {
    for (const c of (t.columns || [])) {
      if (normalizeKey(c?.type) === key) {
        out.push(t);
        break;
      }
    }
  }
  return out;
}

function uniqueTablesFromMatches(matches) {
  const seen = new Set();
  const out = [];
  for (const m of matches || []) {
    const t = m?.table;
    if (!t?.name) continue;
    const k = normalizeKey(t.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function pickSeedTables({ idx, term, maxSeeds }) {
  const resolved = resolveForQuery(idx, term);
  const reasons = [];
  let seeds = [];

  if (resolved.kind === 'table') {
    seeds = [resolved.table];
    const exact = normalizeKey(resolved.table.name) === normalizeKey(term);
    reasons.push({ table: resolved.table.name, reason: exact ? 'exact table match' : 'best table match' });
  } else if (resolved.kind === 'enum') {
    const use = tablesUsingEnum(idx, resolved.enum.name);
    seeds = use;
    for (const t of use) reasons.push({ table: t.name, reason: `uses enum ${resolved.enum.name}` });
  } else if (resolved.kind === 'column') {
    const tables = uniqueTablesFromMatches(resolved.matches);
    seeds = tables;
    for (const t of tables) reasons.push({ table: t.name, reason: `has column ${resolved.columnName}` });
  } else {
    const candidates = resolved.candidates || searchCandidates(idx, term, 20);
    const tableCandidates = candidates.filter((c) => c.kind === 'table');
    if (tableCandidates.length) {
      for (const c of tableCandidates) {
        const t = idx.tablesByLower.get(normalizeKey(c.name));
        if (t) {
          seeds.push(t);
          reasons.push({ table: t.name, reason: `table name match (score: ${c.score})` });
        }
      }
    } else {
      // If no table match, use top column match as a bridge.
      const col = candidates.find((c) => c.kind === 'column');
      if (col) {
        const m = idx.columnsByLower.get(normalizeKey(col.name)) || [];
        const tables = uniqueTablesFromMatches(m);
        seeds = tables;
        for (const t of tables) reasons.push({ table: t.name, reason: `column match: ${col.name}` });
      }
    }
  }

  // Deduplicate and cap.
  const seen = new Set();
  const final = [];
  for (const t of seeds) {
    const k = normalizeKey(t?.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    final.push(t);
    if (final.length >= maxSeeds) break;
  }

  const finalReasons = reasons.filter((r) => final.some((t) => normalizeKey(t.name) === normalizeKey(r.table)));
  return { seeds: final, reasons: finalReasons, resolved };
}

function buildConceptCluster({ idx, graph, term, depth = 1, maxTables = 12, maxSeeds = 3 }) {
  const seedInfo = pickSeedTables({ idx, term, maxSeeds });
  const seeds = seedInfo.seeds;

  if (!seeds.length) {
    const candidates = searchCandidates(idx, term, 15);
    return {
      ok: false,
      term,
      candidates,
      reason: 'No seed tables could be determined from the term.'
    };
  }

  const queue = [];
  const visited = new Map(); // lower -> { table, depth, isSeed }

  for (const t of seeds) {
    const k = normalizeKey(t.name);
    visited.set(k, { table: t, depth: 0, isSeed: true });
    queue.push({ key: k, depth: 0 });
  }

  while (queue.length) {
    const cur = queue.shift();
    const curRec = visited.get(cur.key);
    const curTable = curRec?.table;
    if (!curTable) continue;
    if (cur.depth >= depth) continue;

    const neighbors = neighborsOf(graph, curTable.name);
    for (const nk of neighbors) {
      if (!nk || visited.has(nk)) continue;
      const t = idx.tablesByLower.get(nk);
      if (!t) continue;
      visited.set(nk, { table: t, depth: cur.depth + 1, isSeed: false });
      queue.push({ key: nk, depth: cur.depth + 1 });
    }
  }

  // Join-table expansion:
  // If the cluster includes a join table (many-to-many), include its direct neighbors
  // so concept/graph views show the full chain (A <-> Join <-> B), even if depth=1.
  const joinSeeds = Array.from(visited.entries())
    .map(([_, v]) => v)
    .filter((v) => v && v.table && isJoinTableCandidate(v.table))
    .map((v) => ({ table: v.table, depth: v.depth }));
  for (const jt of joinSeeds) {
    const neighbors = neighborsOf(graph, jt.table.name);
    for (const nk of neighbors) {
      if (!nk || visited.has(nk)) continue;
      const t = idx.tablesByLower.get(nk);
      if (!t) continue;
      visited.set(nk, { table: t, depth: jt.depth + 1, isSeed: false });
    }
  }

  // Rank tables, keep seeds, cap to maxTables.
  const all = Array.from(visited.entries()).map(([k, v]) => {
    const matchScore = scoreNameMatch(v.table.name, term);
    const joinHint = isJoinTableCandidate(v.table);
    const score = (v.isSeed ? 1000 : 0) + (joinHint ? 100 : 0) + (depth - v.depth) * 10 + matchScore * 10;
    return { key: k, ...v, matchScore, joinHint, score };
  });

  all.sort((a, b) => (b.score - a.score) || String(a.table.name).localeCompare(String(b.table.name)));

  const kept = [];
  const keptKeys = new Set();
  for (const r of all) {
    if (r.isSeed) {
      kept.push(r);
      keptKeys.add(r.key);
    }
  }
  for (const r of all) {
    if (kept.length >= maxTables) break;
    if (keptKeys.has(r.key)) continue;
    kept.push(r);
    keptKeys.add(r.key);
  }

  const truncated = all.length > kept.length;

  // Determine roles.
  const tables = kept.map((r) => {
    const role = r.isSeed ? 'seed' : r.joinHint ? 'join' : 'neighbor';
    return {
      name: r.table.name,
      role,
      depth: r.depth,
      matchScore: r.matchScore,
      joinHint: r.joinHint,
      table: r.table
    };
  });

  // Collect edges among kept tables.
  const edges = [];
  for (const r of kept) {
    const outEdges = graph.outgoing.get(r.key) || [];
    for (const e of outEdges) {
      const toKey = normalizeKey(e.to);
      if (!keptKeys.has(toKey)) continue;
      edges.push(e);
    }
  }

  return {
    ok: true,
    term,
    depth,
    maxTables,
    maxSeeds,
    seeds: seedInfo.reasons,
    tables,
    edges,
    truncated
  };
}

function scoreNameMatch(target, term) {
  const tTokens = splitTokens(target);
  const qTokens = splitTokens(term);
  if (!tTokens.length || !qTokens.length) return 0;

  const tNorm = tTokens.join(' ');
  const qNorm = qTokens.join(' ');
  if (tNorm === qNorm) return 1.0;
  // Substring match in either direction (handles pluralization and small variants).
  if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) return 0.85;

  let hits = 0;
  for (const q of qTokens) {
    for (const t of tTokens) {
      if (t === q) hits += 1;
      else if (t.startsWith(q) || q.startsWith(t)) hits += 1;
    }
  }
  if (!hits) return 0;
  const denom = qTokens.length + tTokens.length || 1;
  const score = 0.35 + 0.55 * (hits / denom);
  return Math.min(Math.max(score, 0.35), 0.85);
}

function searchCandidates(idx, term, limit = 10, functionIndex = null) {
  const out = [];

  for (const t of idx.tables) {
    const s = scoreNameMatch(t.name, term);
    if (s > 0) out.push({ kind: 'table', name: t.name, score: Number(s.toFixed(2)) });
  }

  for (const e of idx.enums) {
    const s = scoreNameMatch(e.name, term);
    if (s > 0) out.push({ kind: 'enum', name: e.name, score: Number(s.toFixed(2)) });
  }

  // Columns: aggregate by column name. If exact match, rank higher.
  for (const [colLower, matches] of idx.columnsByLower.entries()) {
    const representative = matches && matches[0] ? matches[0].column.name : colLower;
    const s = scoreNameMatch(representative, term);
    if (s > 0) out.push({ kind: 'column', name: representative, score: Number(Math.min(s, 0.95).toFixed(2)), count: matches.length });
  }

  for (const candidate of searchFunctionCandidates(functionIndex, term, limit)) {
    out.push(candidate);
  }

  out.sort((a, b) => (b.score - a.score) || String(a.kind).localeCompare(String(b.kind)) || String(a.name).localeCompare(String(b.name)));
  return out.slice(0, limit);
}

function resolveForQuery(idx, term, functionIndex = null) {
  const q = String(term || '').trim();
  const qLower = normalizeKey(q);
  if (!qLower) return { kind: 'none', term: q };

  // Table exact
  if (idx.tablesByLower.has(qLower)) return { kind: 'table', table: idx.tablesByLower.get(qLower), term: q };

  // Enum exact
  if (idx.enumsByLower.has(qLower)) return { kind: 'enum', enum: idx.enumsByLower.get(qLower), term: q };

  // Column exact
  if (idx.columnsByLower.has(qLower)) return { kind: 'column', columnName: q, matches: idx.columnsByLower.get(qLower), term: q };

  // Fuzzy: prefer table if strong match
  const candidates = searchCandidates(idx, q, 10, functionIndex);
  if (!candidates.length) return { kind: 'search', term: q, candidates: [] };

  const top = candidates[0];
  if (top.kind === 'table' && top.score >= 0.85) {
    return { kind: 'table', table: idx.tablesByLower.get(normalizeKey(top.name)), term: q, candidates };
  }
  if (top.kind === 'enum' && top.score >= 0.85) {
    return { kind: 'enum', enum: idx.enumsByLower.get(normalizeKey(top.name)), term: q, candidates };
  }
  if (top.kind === 'column' && top.score >= 0.85 && idx.columnsByLower.has(normalizeKey(top.name))) {
    return { kind: 'column', columnName: top.name, matches: idx.columnsByLower.get(normalizeKey(top.name)), term: q, candidates };
  }

  return { kind: 'search', term: q, candidates };
}

function resolveTable(idx, term) {
  const q = String(term || '').trim();
  const qLower = normalizeKey(q);
  if (!qLower) return null;
  if (idx.tablesByLower.has(qLower)) return idx.tablesByLower.get(qLower);

  const candidates = searchCandidates(idx, q, 10);
  const bestTable = candidates.find((c) => c.kind === 'table');
  if (bestTable && bestTable.score >= 0.85) return idx.tablesByLower.get(normalizeKey(bestTable.name));
  return null;
}

function renderTableSummary(table) {
  const cols = Array.isArray(table.columns) ? table.columns : [];
  const idxs = Array.isArray(table.indexes) ? table.indexes : [];
  const rels = Array.isArray(table.relations) ? table.relations : [];

  const pkCols = cols.filter((c) => c && c.primaryKey).map((c) => c.name);
  const uniques = cols.filter((c) => c && c.unique).map((c) => c.name);

  return [
    `- Columns: ${cols.length}`,
    `- Primary key: ${pkCols.length ? pkCols.join(', ') : 'N/A'}`,
    `- Unique fields: ${uniques.length ? uniques.join(', ') : 'N/A'}`,
    `- Indexes: ${idxs.length}`,
    `- Relations (outgoing): ${rels.length}`
  ].join('\n');
}

function yesNo(v) {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (v === null || v === undefined) return '';
  return String(v);
}

function mdTable(headers, rows) {
  const esc = (x) => String(x === null || x === undefined ? '' : x).replace(/\|/g, '\\|').trim();
  const headerLine = `| ${headers.map(esc).join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return [headerLine, sepLine, body].filter(Boolean).join('\n');
}

function renderColumnsTable(table) {
  const cols = Array.isArray(table.columns) ? table.columns : [];
  const rows = cols.map((c) => [
    c.name,
    c.dbName || '',
    c.list ? `${c.type}[]` : c.type,
    yesNo(c.nullable),
    yesNo(c.primaryKey),
    yesNo(c.unique),
    c.default || '',
    c.dbType || ''
  ]);
  return mdTable(['Column', 'DB Name', 'Type', 'Nullable', 'PK', 'Unique', 'Default', 'DB Type'], rows);
}

function renderIndexesTable(table) {
  const idxs = Array.isArray(table.indexes) ? table.indexes : [];
  const rows = idxs.map((i) => [
    i.type || '',
    i.type === 'search'
      ? (i.searchField || '')
      : i.type === 'vector'
        ? (i.vectorField || '')
        : Array.isArray(i.fields)
          ? i.fields.join(', ')
          : '',
    i.name || '',
    i.type === 'search'
      ? [
          i.searchField ? `searchField=${i.searchField}` : '',
          Array.isArray(i.filterFields) && i.filterFields.length ? `filterFields=${i.filterFields.join(', ')}` : '',
          i.staged === true ? 'staged=true' : ''
        ].filter(Boolean).join('; ')
      : i.type === 'vector'
        ? [
            i.vectorField ? `vectorField=${i.vectorField}` : '',
            Number.isFinite(i.dimensions) ? `dimensions=${i.dimensions}` : '',
            Array.isArray(i.filterFields) && i.filterFields.length ? `filterFields=${i.filterFields.join(', ')}` : '',
            i.staged === true ? 'staged=true' : ''
          ].filter(Boolean).join('; ')
        : [
            i.map || '',
            i.staged === true ? 'staged=true' : ''
          ].filter(Boolean).join('; ')
  ]);
  return mdTable(['Type', 'Fields / Target', 'Name', 'Details'], rows);
}

function renderRelationsTable(table) {
  const rels = Array.isArray(table.relations) ? table.relations : [];
  const rows = rels.map((r) => [
    r.field || '',
    r.to || '',
    yesNo(r.optional),
    yesNo(r.list),
    Array.isArray(r.fields) ? r.fields.join(', ') : '',
    Array.isArray(r.references) ? r.references.join(', ') : '',
    r.relationName || ''
  ]);
  return mdTable(['Field', 'To', 'Optional', 'List', 'Fields', 'References', 'Relation'], rows);
}

function renderIncomingRelations(idx, tableName) {
  const incoming = [];
  for (const t of idx.tables) {
    const rels = Array.isArray(t.relations) ? t.relations : [];
    for (const r of rels) {
      if (normalizeKey(r.to) === normalizeKey(tableName)) {
        incoming.push({ from: t.name, field: r.field, fields: r.fields, references: r.references });
      }
    }
  }

  if (!incoming.length) return null;

  const rows = incoming.map((x) => [
    x.from,
    x.field,
    `${(x.fields || []).join(', ')} -> ${(x.references || []).join(', ')}`,
    ''
  ]);

  return mdTable(['From table', 'Field', 'Fields -> References', 'Notes'], rows);
}

function renderTableDoc({ schemaMeta, idx, table }) {
  const header = `# Table: ${table.name}\n\n`;

  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const summary = `## Summary\n\n${renderTableSummary(table)}\n`;

  const columns = `## Columns\n\n${renderColumnsTable(table)}\n`;

  const indexes = `## Indexes\n\n${renderIndexesTable(table)}\n`;

  const relations = `## Relations (outgoing)\n\n${renderRelationsTable(table)}\n`;

  const incoming = renderIncomingRelations(idx, table.name);
  const incomingSection = incoming ? `## Referenced by (incoming)\n\n${incoming}\n` : '';

  return [header, metaLines, '', summary, columns, indexes, relations, incomingSection].filter(Boolean).join('\n');
}

function renderEnumDoc({ schemaMeta, idx, e }) {
  const header = `# Enum: ${e.name}\n\n`;
  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const values = Array.isArray(e.values) ? e.values : [];
  const list = values.length ? values.map((v) => `- \`${v}\``).join('\n') : '_No values recorded in contract._';

  // Where used: tables/columns using this enum as type.
  const used = [];
  for (const t of idx.tables) {
    for (const c of (t.columns || [])) {
      if (normalizeKey(c.type) === normalizeKey(e.name)) used.push({ table: t.name, column: c.name });
    }
  }
  const usedSection = used.length
    ? `## Where used\n\n${mdTable(['Table', 'Column'], used.map((u) => [u.table, u.column]))}\n`
    : '';

  return [header, metaLines, '', '## Values', '', list, '', usedSection].filter(Boolean).join('\n');
}

function renderColumnCrossTableDoc({ schemaMeta, columnName, matches }) {
  const header = `# Column: ${columnName}\n\n`;
  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const rows = matches.map((m) => {
    const c = m.column;
    return [
      m.table.name,
      c.name,
      c.dbName || '',
      c.list ? `${c.type}[]` : c.type,
      yesNo(c.nullable),
      c.default || ''
    ];
  });

  const table = mdTable(['Table', 'Column', 'DB Name', 'Type', 'Nullable', 'Default'], rows);

  const guidance = `## Next steps\n\n- To see a full table view, run:\n  - \`node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <Table>\`\n`;

  return [header, metaLines, '', '## Matches', '', table, '', guidance].filter(Boolean).join('\n');
}

function renderSearchDoc({ schemaMeta, term, candidates }) {
  const header = schemaMeta.convexFunctions?.available
    ? `# DB / Convex surface search: ${term}\n\n`
    : `# DB schema search: ${term}\n\n`;
  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const rows = (candidates || []).map((c) => [c.kind, c.name, String(c.score), c.count ? String(c.count) : '']);
  const table = mdTable(['Kind', 'Name', 'Score', 'Count'], rows);

  const guidanceLines = [
    '## How to proceed',
    '',
    '- If you meant a table: run `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <TableName>`',
    '- If you meant a column: run `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <ColumnName>`'
  ];
  if (schemaMeta.convexFunctions?.available) {
    guidanceLines.push('- If you meant a Convex function: run `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <functionId> --view surface`');
    guidanceLines.push('- To list matching Convex functions: run `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <term> --view functions`');
  }
  guidanceLines.push('- If ambiguous, pick one of the results above and re-run `query`.');
  const guidance = guidanceLines.join('\n');

  return [header, metaLines, '', '## Candidates', '', table, '', guidance].filter(Boolean).join('\n');
}

function renderFunctionMatchesTable(candidates, { includeScore = true } = {}) {
  const rows = (candidates || []).map((candidate) => {
    const fn = candidate.fn || candidate;
    return [
      String(fn.functionId || ''),
      String(fn.exportName || ''),
      String(fn.kind || ''),
      String(fn.visibility || ''),
      String(fn.modulePath || fn.file || ''),
      String(fn?.auth?.kind || ''),
      Array.isArray(fn.tablesRead) && fn.tablesRead.length ? fn.tablesRead.join(', ') : '',
      Array.isArray(fn.tablesWritten) && fn.tablesWritten.length ? fn.tablesWritten.join(', ') : '',
      includeScore ? String(candidate.score ?? '') : undefined
    ];
  });

  const headers = ['Function', 'Export', 'Kind', 'Visibility', 'Module', 'Auth', 'Reads', 'Writes'];
  if (includeScore) headers.push('Score');
  return mdTable(headers, rows.map((row) => includeScore ? row : row.slice(0, -1)));
}

function renderFunctionListDoc({ schemaMeta, term, candidates }) {
  const header = `# Convex functions: ${term}\n\n`;
  const metaLines = [
    `- DB contract source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- Function contract source: \`${schemaMeta.convexFunctions?.sourcePath || schemaMeta.convexFunctions?.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const table = candidates && candidates.length
    ? renderFunctionMatchesTable(candidates, { includeScore: true })
    : '_No Convex functions matched the query._';

  const next = [
    '## Next steps',
    '',
    '- To inspect one function in detail:',
    '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <functionId> --view surface`',
    '- To refresh both DB and function contracts:',
    '  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .`'
  ].join('\n');

  return [header, metaLines, '', '## Matches', '', table, '', next].filter(Boolean).join('\n');
}

function renderFunctionSurfaceDoc({ schemaMeta, fn }) {
  const header = `# Convex function surface: ${fn.functionId}\n\n`;
  const metaLines = [
    `- DB contract source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- Function contract source: \`${schemaMeta.convexFunctions?.sourcePath || schemaMeta.convexFunctions?.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const summary = [
    `- Export: \`${fn.exportName || 'unknown'}\``,
    `- Kind: \`${fn.kind || 'unknown'}\``,
    `- Visibility: \`${fn.visibility || 'unknown'}\``,
    `- Module: \`${fn.modulePath || fn.file || 'unknown'}\``,
    `- Runtime: \`${fn.runtime || 'unknown'}\``,
    `- Auth: \`${fn?.auth?.kind || 'unknown'}\``,
    `- Reads: ${Array.isArray(fn.tablesRead) && fn.tablesRead.length ? fn.tablesRead.map((name) => `\`${name}\``).join(', ') : 'none'}`,
    `- Writes: ${Array.isArray(fn.tablesWritten) && fn.tablesWritten.length ? fn.tablesWritten.map((name) => `\`${name}\``).join(', ') : 'none'}`
  ].join('\n');

  const argsSection = fn.argsValidator
    ? ['## Arguments validator', '', '```json', JSON.stringify(fn.argsValidator, null, 2), '```'].join('\n')
    : '## Arguments validator\n\n_None detected._';

  const returnsSection = fn.returnsValidator
    ? ['## Returns validator', '', '```json', JSON.stringify(fn.returnsValidator, null, 2), '```'].join('\n')
    : '## Returns validator\n\n_None detected._';

  const uses = Object.entries(fn.uses || {})
    .filter(([, value]) => value === true)
    .map(([key]) => key)
    .sort();
  const usesSection = uses.length
    ? `## Runtime hints\n\n- ${uses.join('\n- ')}`
    : '## Runtime hints\n\n_None detected._';

  const next = [
    '## Next steps',
    '',
    '- To inspect the DB side of related tables:',
    '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <TableName>`',
    '- To refresh the generated contracts after source changes:',
    '  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .`'
  ].join('\n');

  return [header, metaLines, '', '## Summary', '', summary, '', argsSection, '', returnsSection, '', usesSection, '', next].filter(Boolean).join('\n');
}

function renderConceptDoc({ schemaMeta, idx, cluster }) {
  const header = `# Concept: ${cluster.term}\n\n`;

  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Depth: \`${cluster.depth}\``,
    `- Max tables: \`${cluster.maxTables}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const seedTable = (cluster.seeds || []).length
    ? mdTable(['Table', 'Reason'], (cluster.seeds || []).map((s) => [s.table, s.reason]))
    : '_No seed resolution details available._';

  const tableRows = (cluster.tables || []).map((t) => {
    const cols = Array.isArray(t.table?.columns) ? t.table.columns : [];
    const rels = Array.isArray(t.table?.relations) ? t.table.relations : [];
    const pk = cols.filter((c) => c?.primaryKey).map((c) => c.name);
    const inc = (schemaMeta.graph?.incoming?.get(normalizeKey(t.name)) || []).length;
    return [
      t.name,
      t.role,
      String(cols.length),
      pk.length ? pk.join(', ') : '',
      String(rels.length),
      String(inc),
      t.joinHint ? 'join-table candidate' : ''
    ];
  });

  const tablesInScope = mdTable(
    ['Table', 'Role', 'Cols', 'PK', 'Outgoing rels', 'Incoming rels', 'Notes'],
    tableRows
  );

  const edgeRows = (cluster.edges || []).map((e) => {
    const mult = e.list ? 'many' : e.optional ? '0..1' : '1';
    return [e.from, e.field || '', e.to, mult, e.relationName || ''];
  });
  const edgesSection = edgeRows.length
    ? mdTable(['From', 'Field', 'To', 'Cardinality', 'Relation'], edgeRows)
    : '_No relations found among selected tables._';

  const next = [
    '## Next steps',
    '',
    '- To view a specific table in full detail:',
    '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <Table>`',
    '- To view a relationship graph:',
    `  - \`node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query "${cluster.term}" --view graph\``,
    '- To draft a change for this concept cluster:',
    `  - \`node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify "${cluster.term}" --scope concept\``
  ].join('\n');

  const trunc = cluster.truncated
    ? `\n\n> Note: results were truncated to the top ${cluster.maxTables} tables for readability. Refine the term or increase --max-tables.`
    : '';

  return [
    header,
    metaLines,
    '',
    '## Seed resolution',
    '',
    seedTable,
    '',
    '## Tables in scope',
    '',
    tablesInScope,
    '',
    '## Relations among tables in scope',
    '',
    edgesSection,
    trunc,
    '',
    next
  ].filter(Boolean).join('\n');
}

function mermaidId(name) {
  const s = String(name || 'X');
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(cleaned)) return `T_${cleaned}`;
  return cleaned || 'T';
}

function renderGraphDoc({ schemaMeta, cluster }) {
  const header = `# Graph: ${cluster.term}\n\n`;
  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Depth: \`${cluster.depth}\``,
    `- Max tables: \`${cluster.maxTables}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const nodes = (cluster.tables || []).map((t) => {
    const id = mermaidId(t.name);
    return `  ${id}["${t.name}"]`;
  });

  // Build undirected pair edges with aggregated labels.
  const pairLabels = new Map();
  for (const e of cluster.edges || []) {
    const a = normalizeKey(e.from);
    const b = normalizeKey(e.to);
    const key = [a, b].sort().join('::');
    const label = `${e.from}.${e.field || 'rel'}${e.list ? '[]' : ''}${e.optional ? '?' : ''}`;
    if (!pairLabels.has(key)) pairLabels.set(key, new Set());
    pairLabels.get(key).add(label);
  }

  const edges = [];
  for (const [k, labels] of pairLabels.entries()) {
    const [a, b] = k.split('::');
    const aName = (cluster.tables || []).find((t) => normalizeKey(t.name) === a)?.name || a;
    const bName = (cluster.tables || []).find((t) => normalizeKey(t.name) === b)?.name || b;
    const aId = mermaidId(aName);
    const bId = mermaidId(bName);
    const lab = Array.from(labels).slice(0, 3).join(', ');
    edges.push(`  ${aId} ---|"${lab}"| ${bId}`);
  }

  const code = [
    '```mermaid',
    'graph TD',
    ...nodes,
    ...edges,
    '```'
  ].join('\n');

  const note = cluster.truncated
    ? `\n\n> Note: results were truncated to the top ${cluster.maxTables} tables. Use --max-tables to expand.`
    : '';

  return [header, metaLines, '', '## Mermaid graph', '', code, note].filter(Boolean).join('\n');
}

function tsTypeFromPrismaType(type) {
  const t = String(type || 'String');
  if (/^array<(.+)>$/i.test(t)) {
    const inner = t.match(/^array<(.+)>$/i);
    return `${tsTypeFromPrismaType(inner && inner[1] ? inner[1] : 'unknown')}[]`;
  }
  if (/^id<.+>$/i.test(t)) return 'string';
  const map = {
    String: 'string',
    string: 'string',
    Boolean: 'boolean',
    boolean: 'boolean',
    Int: 'number',
    BigInt: 'bigint',
    Float: 'number',
    Decimal: 'string',
    DateTime: 'string',
    Json: 'unknown',
    Bytes: 'string',
    number: 'number',
    float64: 'number',
    int64: 'number',
    object: 'Record<string, unknown>',
    bytes: 'string',
    null: 'null'
  };
  return map[t] || 'unknown';
}

function isSensitiveColumnName(name) {
  const n = compactKey(name);
  return /(password|passwd|secret|token|apikey|hash|salt|privatekey|credential|ssn|cvv|card)/.test(n);
}

function renderApiDoc({ schemaMeta, table }) {
  const header = `# API view: Table ${table.name}\n\n`;
  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const cols = Array.isArray(table.columns) ? table.columns : [];
  const publicCols = cols.filter((c) => c && !isSensitiveColumnName(c.name));
  const sensitiveCols = cols.filter((c) => c && isSensitiveColumnName(c.name));

  const identity = publicCols.filter((c) => c.primaryKey || normalizeKey(c.name) === 'id');
  const timestamps = publicCols.filter((c) => ['createdat', 'updatedat', 'deletedat'].includes(compactKey(c.name)));
  const references = publicCols.filter((c) => {
    const ck = compactKey(c.name);
    const isFkLike = (ck.endsWith('id') || ck.endsWith('ids')) && ck !== 'id';
    return isFkLike && !identity.includes(c);
  });
  const content = publicCols.filter((c) => !identity.includes(c) && !timestamps.includes(c) && !references.includes(c));

  function listCols(label, arr) {
    if (!arr.length) return `### ${label}\n\n_None_\n`;
    return `### ${label}\n\n${mdTable(['Column', 'Type', 'Nullable', 'Notes'], arr.map((c) => [c.name, c.list ? `${c.type}[]` : c.type, yesNo(c.nullable), c.unique ? 'unique' : '']))}\n`;
  }

  const dtoFields = publicCols
    .filter((c) => !['deletedat'].includes(compactKey(c.name)))
    .map((c) => {
      const base = tsTypeFromPrismaType(c.type);
      const t = c.list ? `${base}[]` : base;
      const opt = c.nullable === true ? '?' : '';
      return `  ${c.name}${opt}: ${t};`;
    })
    .join('\n');

  const dto = dtoFields
    ? `\n\n\`\`\`ts\nexport type ${table.name}DTO = {\n${dtoFields}\n};\n\`\`\`\n`
    : '\n\n_No scalar columns recorded._\n';

  const relations = Array.isArray(table.relations) ? table.relations : [];
  const relTable = relations.length
    ? mdTable(
        ['Field', 'To', 'Optional', 'List', 'Fields', 'References'],
        relations.map((r) => [
          r.field || '',
          r.to || '',
          yesNo(r.optional),
          yesNo(r.list),
          Array.isArray(r.fields) ? r.fields.join(', ') : '',
          Array.isArray(r.references) ? r.references.join(', ') : ''
        ])
      )
    : '_No relations recorded._';

  const sensitive = sensitiveCols.length
    ? `## Sensitive fields (review)\n\n${mdTable(['Column', 'Type'], sensitiveCols.map((c) => [c.name, c.type]))}\n`
    : '';

  const guidance = [
    '## Notes',
    '',
    '- This is a *suggested* DTO/public API view. Adjust per your domain rules.',
    '- If your business layer forbids Prisma types, treat this as a DTO sketch only.',
    '- For full schema details, use:',
    `  - \`node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query ${table.name} --view table\``
  ].join('\n');

  return [
    header,
    metaLines,
    '',
    '## Suggested field grouping',
    '',
    listCols('Identity', identity),
    listCols('References (FK-like)', references),
    listCols('Timestamps', timestamps),
    listCols('Content', content),
    '## Suggested DTO skeleton',
    dto,
    '## Relations',
    '',
    relTable,
    '',
    sensitive,
    guidance
  ].filter(Boolean).join('\n');
}

function renderConceptModifyDoc({ schemaMeta, cluster, existingDbops }) {
  const header = `# Modify Concept: ${cluster.term}\n\n`;

  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Dialect: \`${schemaMeta.dialect}\``,
    `- Depth: \`${cluster.depth}\``,
    `- Generated at: \`${toIsoNow()}\``,
    '',
    'Edit policy:',
    '- Do NOT edit the snapshot section; it will be regenerated.',
    '- Only edit the `dbops` block.',
    ''
  ].join('\n');

  const tableRows = (cluster.tables || []).map((t) => {
    const cols = Array.isArray(t.table?.columns) ? t.table.columns : [];
    const pk = cols.filter((c) => c?.primaryKey).map((c) => c.name);
    return [t.name, t.role, String(cols.length), pk.join(', '), String((t.table?.relations || []).length)];
  });

  const snapshot = [
    '## Tables in scope (read-only)',
    '',
    mdTable(['Table', 'Role', 'Cols', 'PK', 'Outgoing rels'], tableRows),
    '',
    '## Relationship map (read-only)',
    '',
    renderGraphDoc({ schemaMeta, cluster })
      .split('\n')
      .filter((line) => !line.startsWith('# '))
      .join('\n'),
    '',
    '## Notes',
    '',
    '- Prefer expressing changes as explicit ops below (grouped by table).',
    '- If the change is large, consider splitting into per-table modify docs.',
    '- For a full table detail view, run:',
    '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <Table>`'
  ].join('\n');

  const dbops = existingDbops && typeof existingDbops === 'object' ? existingDbops : defaultDbops();

  const editable = [
    '## Requested changes (editable)',
    '',
    '```dbops',
    JSON.stringify(dbops, null, 2),
    '```',
    '',
    '## Next steps',
    '',
    `- Run: \`node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan "${cluster.term}"\``
  ].join('\n');

  return [header, metaLines, snapshot, '', editable].join('\n');
}

function extractDbopsBlock(markdown) {
  const re = /```dbops\s*([\s\S]*?)```/m;
  const m = String(markdown || '').match(re);
  if (!m) return { ok: false, error: 'Missing ```dbops fenced block.' };

  const raw = String(m[1] || '').trim();
  if (!raw) return { ok: false, error: 'Empty dbops block.' };

  try {
    const obj = JSON.parse(raw);
    return { ok: true, obj };
  } catch (e) {
    return { ok: false, error: `Invalid JSON in dbops block: ${e.message}` };
  }
}

function defaultDbops() {
  return { ops: [], notes: '' };
}

function renderModifyDoc({ schemaMeta, idx, table, existingDbops }) {
  const header = `# Modify Table: ${table.name}\n\n`;

  const metaLines = [
    `- Source: \`${schemaMeta.sourcePath || schemaMeta.sourceKind || 'unknown'}\``,
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Generated at: \`${toIsoNow()}\``,
    '',
    'Edit policy:',
    '- Do NOT edit the snapshot section; it will be regenerated.',
    '- Only edit the `dbops` block.',
    ''
  ].join('\n');

  const snapshot = [
    '## Current snapshot (read-only)',
    '',
    '### Columns',
    '',
    renderColumnsTable(table),
    '',
    '### Indexes',
    '',
    renderIndexesTable(table),
    '',
    '### Relations (outgoing)',
    '',
    renderRelationsTable(table)
  ].join('\n');

  const dbops = existingDbops && typeof existingDbops === 'object' ? existingDbops : defaultDbops();

  const editable = [
    '## Requested changes (editable)',
    '',
    '```dbops',
    JSON.stringify(dbops, null, 2),
    '```',
    '',
    '## Next steps',
    '',
    `- Run: \`node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan ${table.name}\``
  ].join('\n');

  return [header, metaLines, snapshot, '', editable].join('\n');
}

function prismaFieldLineFromColumn(col, knownEnums) {
  const type = String(col.type || 'String');
  const nullable = col.nullable === true;
  const list = col.list === true;

  let token = type;
  if (list) token = `${token}[]`;
  else if (nullable) token = `${token}?`;

  const attrs = [];
  if (col.primaryKey) attrs.push('@id');
  if (col.unique) attrs.push('@unique');

  // Default: expect Prisma-style default (e.g. "active", now(), uuid()).
  if (col.default) attrs.push(`@default(${col.default})`);

  if (col.dbName) attrs.push(`@map("${col.dbName}")`);
  if (col.dbType) attrs.push(`@db.${col.dbType}`);

  // If type is enum-like but not in known enums, leave as-is.
  // LLM/human can adjust.

  return `${col.name} ${token}${attrs.length ? ' ' + attrs.join(' ') : ''}`.trim();
}

function prismaIndexLineFromIndex(index) {
  const fields = Array.isArray(index.fields) ? index.fields : Array.isArray(index.columns) ? index.columns : [];
  const kind = String(index.type || 'index');

  const fieldsPart = `[${fields.join(', ')}]`;

  let directive = '@@index';
  if (kind === 'unique') directive = '@@unique';
  if (kind === 'primary') directive = '@@id';

  const args = [];
  args.push(fieldsPart);
  if (index.name) args.push(`name: "${index.name}"`);
  if (index.map) args.push(`map: "${index.map}"`);

  return `${directive}(${args.join(', ')})`;
}

function sqlDialect(schemaMeta) {
  const d = String(schemaMeta.dialect || '').toLowerCase();
  if (d.includes('postgres')) return 'postgres';
  if (d.includes('mysql')) return 'mysql';
  if (d.includes('sqlite')) return 'sqlite';
  if (d.includes('sqlserver') || d.includes('mssql')) return 'sqlserver';
  return d || 'generic';
}

function quoteIdent(dialect, ident) {
  const name = String(ident || '');
  if (!name) return '';
  if (dialect === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  // default postgres/sqlite/sqlserver-ish
  return `"${name.replace(/"/g, '""')}"`;
}

function prismaDefaultToSql(defaultExpr, dialect, colType) {
  const raw = String(defaultExpr || '').trim();
  if (!raw) return '';

  // Already a SQL single-quoted string literal.
  if (/^'[^']*(?:''[^']*)*'$/.test(raw)) return raw;

  // "active" -> 'active'
  const m = raw.match(/^"([\s\S]*)"$/);
  if (m) return `'${m[1].replace(/'/g, "''")}'`;

  // Booleans
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase();

  if (/^now\(\)$/i.test(raw)) return dialect === 'mysql' ? 'CURRENT_TIMESTAMP(3)' : 'CURRENT_TIMESTAMP';
  if (/^uuid\(\)$/i.test(raw)) {
    if (dialect === 'postgres') return 'gen_random_uuid()';
    if (dialect === 'mysql') return 'UUID()';
    return 'uuid()';
  }

  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;

  // If this looks like a function call or SQL keyword, treat as raw.
  const looksLikeFn = /^[a-z_][a-z0-9_]*\s*\([\s\S]*\)$/i.test(raw);
  const looksLikeKeyword = /^(current_timestamp|current_date|current_time)$/i.test(raw);

  // If the column type is string/enum-like, default unquoted strings should be quoted.
  const builtin = new Set(['String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes']);
  const ct = String(colType || '').trim().replace(/\[\]$/, '');
  const isStringish = !ct || ct === 'String' || (!builtin.has(ct) && ct !== 'Int' && ct !== 'BigInt' && ct !== 'Float' && ct !== 'Decimal' && ct !== 'Boolean' && ct !== 'DateTime');
  if (isStringish && !looksLikeFn && !looksLikeKeyword) {
    return `'${raw.replace(/'/g, "''")}'`;
  }

  // Otherwise, treat as a raw SQL expression and keep as-is.
  return raw;
}

function prismaTypeToSql(type, dialect) {
  const t = String(type || 'String');

  // If it's clearly an enum, we cannot know whether DB uses native enums.
  // Default to TEXT/VARCHAR with a comment.

  const map = {
    postgres: {
      String: 'TEXT',
      Boolean: 'BOOLEAN',
      Int: 'INTEGER',
      BigInt: 'BIGINT',
      Float: 'DOUBLE PRECISION',
      Decimal: 'DECIMAL',
      DateTime: 'TIMESTAMPTZ',
      Json: 'JSONB',
      Bytes: 'BYTEA'
    },
    mysql: {
      String: 'VARCHAR(255)',
      Boolean: 'BOOLEAN',
      Int: 'INT',
      BigInt: 'BIGINT',
      Float: 'DOUBLE',
      Decimal: 'DECIMAL',
      DateTime: 'DATETIME(3)',
      Json: 'JSON',
      Bytes: 'BLOB'
    },
    sqlite: {
      String: 'TEXT',
      Boolean: 'INTEGER',
      Int: 'INTEGER',
      BigInt: 'INTEGER',
      Float: 'REAL',
      Decimal: 'REAL',
      DateTime: 'TEXT',
      Json: 'TEXT',
      Bytes: 'BLOB'
    },
    sqlserver: {
      String: 'NVARCHAR(255)',
      Boolean: 'BIT',
      Int: 'INT',
      BigInt: 'BIGINT',
      Float: 'FLOAT',
      Decimal: 'DECIMAL',
      DateTime: 'DATETIME2',
      Json: 'NVARCHAR(MAX)',
      Bytes: 'VARBINARY(MAX)'
    },
    generic: {
      String: 'TEXT',
      Boolean: 'BOOLEAN',
      Int: 'INTEGER',
      BigInt: 'BIGINT',
      Float: 'DOUBLE',
      Decimal: 'DECIMAL',
      DateTime: 'TIMESTAMP',
      Json: 'JSON',
      Bytes: 'BLOB'
    }
  };

  const m = map[dialect] || map.generic;
  return m[t] || m.String;
}

function notNullBackfillGuidance(dialect, fullTable, colIdent, sqlType) {
  const d = String(dialect || 'generic');
  if (d === 'postgres') {
    return (
      `-- Safer alternative for existing rows (two-step, Postgres-style):\n` +
      `-- 1) Add column as NULL\n` +
      `-- 2) Backfill values\n` +
      `-- 3) Set NOT NULL\n` +
      `-- Example:\n` +
      `-- ALTER TABLE ${fullTable} ADD COLUMN ${colIdent} ${sqlType};\n` +
      `-- UPDATE ${fullTable} SET ${colIdent} = <value> WHERE ${colIdent} IS NULL;\n` +
      `-- ALTER TABLE ${fullTable} ALTER COLUMN ${colIdent} SET NOT NULL;`
    );
  }

  if (d === 'mysql') {
    return (
      `-- Safer alternative for existing rows (two-step, MySQL-style):\n` +
      `-- 1) Add column as NULL\n` +
      `-- 2) Backfill values\n` +
      `-- 3) Set NOT NULL (requires restating type)\n` +
      `-- Example:\n` +
      `-- ALTER TABLE ${fullTable} ADD COLUMN ${colIdent} ${sqlType} NULL;\n` +
      `-- UPDATE ${fullTable} SET ${colIdent} = <value> WHERE ${colIdent} IS NULL;\n` +
      `-- ALTER TABLE ${fullTable} MODIFY ${colIdent} ${sqlType} NOT NULL;`
    );
  }

  if (d === 'sqlserver') {
    return (
      `-- Safer alternative for existing rows (two-step, SQL Server-style):\n` +
      `-- 1) Add column as NULL\n` +
      `-- 2) Backfill values\n` +
      `-- 3) Set NOT NULL (requires restating type)\n` +
      `-- Example:\n` +
      `-- ALTER TABLE ${fullTable} ADD ${colIdent} ${sqlType} NULL;\n` +
      `-- UPDATE ${fullTable} SET ${colIdent} = <value> WHERE ${colIdent} IS NULL;\n` +
      `-- ALTER TABLE ${fullTable} ALTER COLUMN ${colIdent} ${sqlType} NOT NULL;`
    );
  }

  if (d === 'sqlite') {
    return (
      `-- SQLite note: changing NULLability may require a table rebuild.\n` +
      `-- Consider using a migration tool (or manual table-copy procedure) for NOT NULL enforcement.`
    );
  }

  return (
    `-- Safer alternative for existing rows (two-step):\n` +
    `-- 1) Add column as NULL\n` +
    `-- 2) Backfill values\n` +
    `-- 3) Enforce NOT NULL (dialect-specific)\n` +
    `-- Example:\n` +
    `-- ALTER TABLE ${fullTable} ADD COLUMN ${colIdent} ${sqlType};\n` +
    `-- UPDATE ${fullTable} SET ${colIdent} = <value> WHERE ${colIdent} IS NULL;`
  );
}


function normalizeOps(obj) {
  const root = obj && typeof obj === 'object' ? obj : {};
  const ops = Array.isArray(root.ops) ? root.ops : [];
  const notes = typeof root.notes === 'string' ? root.notes : '';

  return { ops, notes };
}

function validateOps({ idx, ops }) {
  const problems = [];

  // Pre-scan addColumn ops to support:
  // - duplicate detection
  // - index validation against newly added columns
  const addColumnCounts = new Map(); // key: tableKey::colKey -> count
  const addedColsByTable = new Map(); // tableKey -> Set(colKey)

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    const kind = String(op?.op || '').trim();
    if (kind !== 'addColumn') continue;
    const tableName = String(op.table || '').trim();
    const colName = String(op?.column?.name || '').trim();
    if (!tableName || !colName) continue;
    const tKey = normalizeKey(tableName);
    const cKey = normalizeKey(colName);
    const k = `${tKey}::${cKey}`;
    addColumnCounts.set(k, (addColumnCounts.get(k) || 0) + 1);
    if (!addedColsByTable.has(tKey)) addedColsByTable.set(tKey, new Set());
    addedColsByTable.get(tKey).add(cKey);
  }

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (!op || typeof op !== 'object') {
      problems.push({ level: 'error', opIndex: i, message: 'Op must be an object.' });
      continue;
    }
    const kind = String(op.op || '').trim();
    if (!kind) {
      problems.push({ level: 'error', opIndex: i, message: 'Missing op.op.' });
      continue;
    }

    if (kind === 'addColumn') {
      const tableName = String(op.table || '').trim();
      const column = op.column && typeof op.column === 'object' ? op.column : null;
      const colName = String(column?.name || '').trim();
      const colType = String(column?.type || '').trim();

      if (!tableName) problems.push({ level: 'error', opIndex: i, message: 'addColumn requires op.table.' });
      if (!column) problems.push({ level: 'error', opIndex: i, message: 'addColumn requires op.column.' });
      if (column) {
        if (!colName) problems.push({ level: 'error', opIndex: i, message: 'addColumn requires column.name.' });
        if (!colType) problems.push({ level: 'error', opIndex: i, message: 'addColumn requires column.type.' });
      }

      const t = tableName ? idx.tablesByLower.get(normalizeKey(tableName)) : null;
      if (!t) {
        problems.push({ level: 'warn', opIndex: i, message: `Table '${tableName}' not found in current contract.` });
      } else if (colName) {
        const exists = (t.columns || []).some((c) => normalizeKey(c.name) === normalizeKey(colName));
        if (exists) problems.push({ level: 'error', opIndex: i, message: `Column '${colName}' already exists on table '${t.name}'.` });
      }

      // Duplicate addColumn ops within the same change doc.
      if (tableName && colName) {
        const k = `${normalizeKey(tableName)}::${normalizeKey(colName)}`;
        if ((addColumnCounts.get(k) || 0) > 1) problems.push({ level: 'error', opIndex: i, message: `Duplicate addColumn for '${tableName}.${colName}' in dbops.` });
      }
    } else if (kind === 'addIndex') {
      const tableName = String(op.table || '').trim();
      const index = op.index && typeof op.index === 'object' ? op.index : null;

      if (!tableName) problems.push({ level: 'error', opIndex: i, message: 'addIndex requires op.table.' });
      if (!index) problems.push({ level: 'error', opIndex: i, message: 'addIndex requires op.index.' });

      const cols = index && (index.columns || index.fields);
      const fields = Array.isArray(cols) ? cols.filter(Boolean) : [];
      if (index && fields.length === 0) {
        problems.push({ level: 'error', opIndex: i, message: 'addIndex requires index.columns (or index.fields) as a non-empty array.' });
      }

      const t = tableName ? idx.tablesByLower.get(normalizeKey(tableName)) : null;
      if (!t) {
        problems.push({ level: 'warn', opIndex: i, message: `Table '${tableName}' not found in current contract.` });
      } else {
        // Validate index fields against: existing columns + newly added columns in this dbops.
        const effectiveCols = new Set((t.columns || []).map((c) => normalizeKey(c.name)));
        const added = addedColsByTable.get(normalizeKey(tableName));
        if (added) for (const c of added) effectiveCols.add(c);

        const missing = fields.filter((f) => !effectiveCols.has(normalizeKey(f)));
        if (missing.length) {
          problems.push({ level: 'warn', opIndex: i, message: `Index references missing columns on '${t.name}': ${missing.join(', ')}` });
        }

        const indexName = String(index.name || '').trim();
        if (indexName) {
          const dup = (t.indexes || []).some((ix) => normalizeKey(ix.name) === normalizeKey(indexName));
          if (dup) problems.push({ level: 'warn', opIndex: i, message: `Index name '${indexName}' already exists on '${t.name}'.` });
        }
      }
    } else if (kind === 'addEnum') {
      const enumName = String(op.name || op.enum || '').trim();
      const values = Array.isArray(op.values) ? op.values : [];
      if (!enumName) problems.push({ level: 'error', opIndex: i, message: 'addEnum requires op.name (or op.enum).' });
      if (!values.length) problems.push({ level: 'error', opIndex: i, message: 'addEnum requires op.values as a non-empty array.' });
      const exists = enumName ? idx.enumsByLower.get(normalizeKey(enumName)) : null;
      if (exists) problems.push({ level: 'warn', opIndex: i, message: `Enum '${enumName}' already exists in current contract.` });
    } else if (kind === 'addTable') {
      const tableName = String(op.table || op.name || '').trim();
      if (!tableName) problems.push({ level: 'error', opIndex: i, message: 'addTable requires op.table (or op.name).' });
      const exists = tableName ? idx.tablesByLower.get(normalizeKey(tableName)) : null;
      if (exists) problems.push({ level: 'warn', opIndex: i, message: `Table '${tableName}' already exists in current contract.` });
      // Table definition is optional; if missing, plan will instruct manual fill.
    } else {
      problems.push({ level: 'warn', opIndex: i, message: `Unsupported op '${kind}'. It will not be auto-translated; include manual guidance in notes.` });
    }
  }

  return problems;
}

function formatProblems(problems) {
  if (!problems.length) return '_No validation issues detected._';

  const rows = problems.map((p) => [
    p.level,
    `#${p.opIndex}`,
    p.message
  ]);

  return mdTable(['Level', 'Op', 'Message'], rows);
}

function groupOps(dbops) {
  const ops = Array.isArray(dbops?.ops) ? dbops.ops : [];
  const byTable = new Map();
  const global = [];

  for (const op of ops) {
    const kind = String(op?.op || '').trim();
    const table = String(op?.table || '').trim();
    const isTableScoped = (kind === 'addColumn' || kind === 'addIndex');
    if (isTableScoped && table) {
      if (!byTable.has(table)) byTable.set(table, []);
      byTable.get(table).push(op);
    } else {
      global.push(op);
    }
  }

  return { ops, byTable, global };
}

function analyzeOpsImpact({ idx, ops }) {
  const rows = [];
  const getTable = (name) => idx.tablesByLower.get(normalizeKey(name));

  const addedColsByTable = new Map();
  for (const op of (ops || [])) {
    const kind = String(op?.op || '').trim();
    if (kind !== 'addColumn') continue;
    const tableName = String(op?.table || '').trim();
    const c = op?.column || {};
    const colName = String(c?.name || '').trim();
    if (!tableName || !colName) continue;
    const tk = normalizeKey(tableName);
    if (!addedColsByTable.has(tk)) addedColsByTable.set(tk, new Set());
    addedColsByTable.get(tk).add(normalizeKey(colName));
  }

  for (let i = 0; i < (ops || []).length; i += 1) {
    const op = ops[i];
    const kind = String(op?.op || '').trim();

    if (kind === 'addColumn') {
      const tableName = String(op?.table || '').trim();
      const c = op?.column || {};
      const colName = String(c?.name || '').trim();
      const nullable = c?.nullable === true;
      const hasDefault = !!String(c?.default || '').trim();

      const t = tableName ? getTable(tableName) : null;
      if (t && colName) {
        const existsCol = (t.columns || []).some((x) => normalizeKey(x?.name) === normalizeKey(colName));
        if (existsCol) {
          rows.push(['error', `#${i}`, `Column already exists: ${tableName}.${colName}`, 'Choose a new column name or use a manual migration plan.']);
        }
      }

      if (!nullable && !hasDefault) {
        rows.push(['warn', `#${i}`, `NOT NULL column without default: ${tableName}.${colName}`, 'Prefer two-step: add NULL -> backfill -> enforce NOT NULL.']);
      }
    } else if (kind === 'addIndex') {
      const tableName = String(op?.table || '').trim();
      const ix = op?.index || {};
      const cols = Array.isArray(ix?.columns || ix?.fields) ? (ix.columns || ix.fields) : [];
      const t = tableName ? getTable(tableName) : null;
      if (t && cols.length) {
        const tk = normalizeKey(tableName);
        const effectiveCols = new Set((t.columns || []).map((x) => normalizeKey(x?.name)));
        for (const added of (addedColsByTable.get(tk) || new Set())) effectiveCols.add(added);
        const missing = cols.filter((c) => !effectiveCols.has(normalizeKey(c)));
        if (missing.length) {
          rows.push(['warn', `#${i}`, `Index references missing columns on ${tableName}: ${missing.join(', ')}`, 'Verify column names; run query <Table> for details.']);
        }
      }
      const name = String(ix?.name || '').trim();
      if (t && name) {
        const existsIx = (t.indexes || []).some((x) => normalizeKey(x?.name) === normalizeKey(name));
        if (existsIx) rows.push(['warn', `#${i}`, `Index name already exists on ${tableName}: ${name}`, 'Pick a distinct index name.']);
      }
      const it = String(ix?.type || '').toLowerCase();
      if (it === 'unique') {
        rows.push(['warn', `#${i}`, `Unique index requested on ${tableName}`, 'Ensure existing data has no duplicates before applying.']);
      }
    } else if (kind === 'addTable') {
      const name = String(op?.table || op?.name || '').trim();
      if (name && getTable(name)) rows.push(['warn', `#${i}`, `Table already exists: ${name}`, 'If you mean to extend it, use addColumn/addIndex instead.']);
    } else if (kind === 'addEnum') {
      const name = String(op?.name || op?.enum || '').trim();
      if (name && idx.enumsByLower.has(normalizeKey(name))) rows.push(['warn', `#${i}`, `Enum already exists: ${name}`, 'If you mean to extend values, do it manually and update your SSOT workflow.']);
    }
  }

  return rows;
}

function renderPlanDoc({ schemaMeta, idx, objectLabel, dbops, problems, knownEnums }) {
  const header = `# Plan: ${objectLabel}\n\n`;
  const meta = [
    `- SSOT mode: \`${schemaMeta.ssotMode}\``,
    `- Input modify doc: \`${schemaMeta.modifyDocRel}\``,
    `- Generated at: \`${toIsoNow()}\``
  ].join('\n');

  const grouped = groupOps(dbops);
  const ops = grouped.ops;
  const impactedTables = Array.from(grouped.byTable.keys());

  const summary = [
    `- Ops: ${ops.length}`,
    `- Impacted tables: ${impactedTables.length ? impactedTables.join(', ') : 'N/A'}`
  ].join('\n');

  const opsList = ops.length
    ? [
        ...impactedTables
          .sort((a, b) => a.localeCompare(b))
          .flatMap((t) => {
            const list = grouped.byTable.get(t) || [];
            const lines = list.map((o) => {
              const kind = String(o?.op || '').trim();
              if (kind === 'addColumn') {
                const c = o.column || {};
                return `- **addColumn** \`${t}\`.\`${c.name}\` : \`${c.type}${c.nullable ? '?' : ''}\`${c.default ? ` (default: ${c.default})` : ''}`;
              }
              if (kind === 'addIndex') {
                const ix = o.index || {};
                const cols = Array.isArray(ix.columns || ix.fields) ? (ix.columns || ix.fields) : [];
                return `- **addIndex** \`${t}\` on [${cols.join(', ')}]${ix.name ? ` (name: ${ix.name})` : ''}${String(ix.type).toLowerCase() === 'unique' ? ' (unique)' : ''}`;
              }
              return `- **${kind}** (manual guidance required)`;
            });
            return [`### Table: ${t}`, '', ...lines, ''];
          }),
        ...(grouped.global.length
          ? [
              '### Global ops',
              '',
              ...grouped.global.map((o) => {
                const kind = String(o?.op || '').trim();
                if (kind === 'addEnum') return `- **addEnum** \`${o.name || o.enum}\` values: ${(o.values || []).join(', ')}`;
                if (kind === 'addTable') return `- **addTable** \`${o.table || o.name}\``;
                return `- **${kind}** (manual guidance required)`;
              }),
              ''
            ]
          : [])
      ].join('\n')
    : '_No ops specified._';

  const validation = `## Validation\n\n${formatProblems(problems)}\n`;

  const notes = dbops.notes ? `## Notes\n\n${dbops.notes}\n` : '';

  const impactRows = analyzeOpsImpact({ idx, ops });
  const impact = impactRows.length
    ? `## Impact analysis\n\n${mdTable(['Severity', 'Op', 'Finding', 'Recommendation'], impactRows)}\n`
    : '## Impact analysis\n\n_No additional findings._\n';

  const handoffRepoPrisma = [
    '## Handoff (repo-prisma SSOT)',
    '',
    'This tool does **not** run migrations. After human review:',
    '',
    '1. Apply the change to `prisma/schema.prisma` (SSOT).',
    '2. Run workflow skill `sync-db-schema-from-code` to generate migrations, apply them, and refresh `docs/context/db/schema.json`.'
  ].join('\n');

  const prismaSnippets = [];
  if (schemaMeta.ssotMode === 'repo-prisma') {
    for (const op of grouped.global) {
      const kind = String(op?.op || '').trim();
      if (kind === 'addEnum') {
        const values = Array.isArray(op.values) ? op.values : [];
        prismaSnippets.push(
          `### Enum: ${op.name || op.enum}\n\n\`\`\`prisma\nenum ${op.name || op.enum} {\n  ${values.join('\n  ')}\n}\n\`\`\``
        );
      }
    }

    for (const [tableName, list] of grouped.byTable.entries()) {
      const lines = [];
      for (const op of list) {
        const kind = String(op?.op || '').trim();
        if (kind === 'addColumn') lines.push(`- Field: \`${prismaFieldLineFromColumn(op.column || {}, knownEnums)}\``);
        if (kind === 'addIndex') lines.push(`- Model-level: \`${prismaIndexLineFromIndex(op.index || {})}\``);
      }
      if (lines.length) prismaSnippets.push(`### Model: ${tableName}\n\n${lines.join('\n')}`);
    }
  }

  const handoffDatabase = [
    '## Handoff (database SSOT)',
    '',
    'This tool does **not** modify the real DB. Use the generated runbook (if SSOT mode is `database`), then run workflow skill `sync-code-schema-from-db` to refresh Prisma mirror + context contract.',
    '',
    `- Runbook path: \`${schemaMeta.runbookRel}\``
  ].join('\n');

  const handoffConvex = [
    '## Handoff (convex SSOT)',
    '',
    'This tool does **not** edit Convex files directly. After human review:',
    '',
    '1. Apply the change in `convex/schema.ts` for persisted fields, relations, and indexes.',
    '2. Update related functions under `convex/**/*.ts`.',
    '3. Run `npx convex codegen` (or `npx convex dev` when working interactively).',
    '4. Run `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` to refresh `docs/context/db/schema.json` and `docs/context/convex/functions.json`.',
    '5. Run `node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict`.',
    '6. Only if other context artifacts were edited manually, run `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch --repo-root .`.',
    '7. Use `convex-best-practices` for implementation and review guardrails.'
  ].join('\n');

  const ssotRouting = schemaMeta.ssotMode === 'database'
    ? handoffDatabase
    : schemaMeta.ssotMode === 'convex'
      ? handoffConvex
      : handoffRepoPrisma;

  // Prisma snippets are only actionable when repo-prisma is SSOT.
  // In database-as-SSOT mode, Prisma is a mirror and must not be edited as desired-state.
  const includePrismaSnippets = schemaMeta.ssotMode === 'repo-prisma';
  const prismaSection =
    includePrismaSnippets && prismaSnippets.length
      ? ['## Suggested Prisma snippets', '', prismaSnippets.join('\n\n')].join('\n')
      : '';

  const body = [
    header,
    meta,
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Requested ops',
    '',
    opsList,
    '',
    validation,
    impact,
    notes,
    ssotRouting,
    '',
    prismaSection
  ].filter(Boolean).join('\n');

  return body;
}

function renderRunbookDoc({ schemaMeta, idx, objectLabel, dbops }) {
  const dialect = sqlDialect(schemaMeta);
  const qt = (x) => quoteIdent(dialect, x);

  const header = `# DB Change Runbook: ${objectLabel}\n\n`;
  const meta = [
    `- SSOT mode: \`${schemaMeta.ssotMode}\` (real DB is source of truth)`,
    `- Dialect (from contract): \`${dialect}\``,
    `- Generated at: \`${toIsoNow()}\``,
    '',
    '**Safety rules:**',
    '- Run in the correct environment (dev/staging/prod).',
    '- Review locking impact for large tables.',
    '- Prefer two-step backfills for non-null additions on existing tables.',
    '- Do not paste secrets into chat.'
  ].join('\n');

  const grouped = groupOps(dbops);
  const sections = [];

  // Global ops section (enums/tables/etc).
  if (grouped.global.length) {
    const lines = grouped.global.map((op) => {
      const kind = String(op?.op || '').trim();
      if (kind === 'addEnum') {
        const enumName = String(op.name || op.enum || '').trim();
        const values = Array.isArray(op.values) ? op.values : [];
        return (
          `-- Enum '${enumName}' requested. DB-level enum support is dialect-specific.\n` +
          `-- Recommended baseline: represent as TEXT/VARCHAR + app-level validation, or create a CHECK constraint.\n` +
          `-- Values: ${values.join(', ')}`
        );
      }
      if (kind === 'addTable') {
        const name = String(op.table || op.name || '').trim();
        const createName = qt(name);
        return (
          `-- Table '${name}' requested. Fill in columns carefully.\n` +
          `CREATE TABLE ${createName} (\n  -- columns...\n);`
        );
      }
      return `-- Unsupported op '${kind}'. Add manual SQL here.`;
    });

    sections.push(
      ['## Global ops', '', '```sql', lines.join('\n\n'), '```', ''].join('\n')
    );
  }

  const tableNames = Array.from(grouped.byTable.keys()).sort((a, b) => a.localeCompare(b));
  for (const tableName of tableNames) {
    const ops = grouped.byTable.get(tableName) || [];
    const t = idx.tablesByLower.get(normalizeKey(tableName)) || null;

    const tblName = (t && (t.dbName || t.name)) ? (t.dbName || t.name) : tableName;
    const fullTable = t && t.schema ? `${qt(t.schema)}.${qt(tblName)}` : qt(tblName);

    const statements = [];
    const verification = [];
    const rollback = [];

    for (const op of ops) {
      const kind = String(op?.op || '').trim();
      if (kind === 'addColumn') {
        const c = op.column || {};
        const colName = c.dbName || c.name;
        const colIdent = qt(colName);
        const sqlType = prismaTypeToSql(c.type, dialect);

        const nullable = c.nullable === true;
        const defaultSql = c.default ? prismaDefaultToSql(c.default, dialect, c.type) : '';

        const parts = [`ALTER TABLE ${fullTable} ADD COLUMN ${colIdent} ${sqlType}`];
        if (defaultSql) parts.push(`DEFAULT ${defaultSql}`);
        if (!nullable) parts.push('NOT NULL');
        statements.push(parts.join(' ') + ';');

        verification.push(
          `-- Verify column exists\nSELECT *\nFROM information_schema.columns\nWHERE table_name = '${tblName}' AND column_name = '${colName}';`
        );
        rollback.push(`-- Rollback (destructive)\nALTER TABLE ${fullTable} DROP COLUMN ${colIdent};`);

        if (!nullable && !defaultSql) statements.push(notNullBackfillGuidance(dialect, fullTable, colIdent, sqlType));
      } else if (kind === 'addIndex') {
        const ix = op.index || {};
        const cols = Array.isArray(ix.columns || ix.fields) ? (ix.columns || ix.fields) : [];
        const idxName = ix.name || `${tblName}_${cols.join('_')}_${String(ix.type).toLowerCase() === 'unique' ? 'uniq' : 'idx'}`;
        const unique = String(ix.type || '').toLowerCase() === 'unique';

        const colsSql = cols.map((c) => qt(c)).join(', ');
        statements.push(`${unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX'} ${qt(idxName)} ON ${fullTable} (${colsSql});`);

        verification.push(`-- Verify index exists\n-- (dialect-specific; adjust as needed)`);
        const drop = (dialect === 'mysql' || dialect === 'sqlserver')
          ? `DROP INDEX ${qt(idxName)} ON ${fullTable};`
          : `DROP INDEX ${qt(idxName)};`;
        rollback.push(drop);
      } else {
        statements.push(`-- Unsupported op '${kind}'. Add manual SQL here.`);
      }
    }

    const sqlSection = ['### Forward changes', '', '```sql', statements.join('\n\n'), '```', ''].join('\n');
    const verifySection = verification.length
      ? ['### Verification', '', '```sql', verification.join('\n\n'), '```', ''].join('\n')
      : '### Verification\n\n_Add verification queries for your dialect._\n';
    const rollbackSection = ['### Rollback (destructive)', '', '```sql', rollback.join('\n\n'), '```', ''].join('\n');

    sections.push(['## Table: ' + tableName, '', sqlSection, verifySection, rollbackSection].join('\n'));
  }

  const post = [
    '## Post-change: refresh repo mirrors and context',
    '',
    'After the real DB change is applied and verified:',
    '',
    '- Run workflow skill `sync-code-schema-from-db` (DB → Prisma → mirror → context).',
    '- Or run the underlying commands (if your process allows):',
    '  - `npx prisma db pull` (human, correct env)',
    '  - `node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma`',
    '  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`'
  ].join('\n');

  return [header, meta, '', ...sections, post].join('\n');
}

function printHelp() {
  const msg = `ctl-db-doc.mjs — Human-friendly DB structure and change drafting\n\n` +
    `Usage:\n` +
    `  node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs status [--repo-root <path>]\n` +
    `  node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs search <term> [--repo-root <path>]\n` +
    `  node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <object> [--view table|concept|graph|api|functions|surface] [--depth <n>] [--max-tables <n>] [--repo-root <path>]\n` +
    `  node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify <object> [--scope table|concept] [--depth <n>] [--max-tables <n>] [--repo-root <path>]\n` +
    `  node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan <object> [--repo-root <path>]\n\n` +
    `Artifacts:\n` +
    `  .ai/.tmp/database/structure_query/<object>.md\n` +
    `  .ai/.tmp/database/structure_query/<object>__functions.md\n` +
    `  .ai/.tmp/database/structure_query/<object>__surface.md\n` +
    `  .ai/.tmp/database/structure_modify/<object>.md\n` +
    `  .ai/.tmp/database/structure_modify/<object>.plan.md\n` +
    `  .ai/.tmp/database/structure_modify/<object>.runbook.md (db.ssot=database)\n`;

  console.log(msg);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = String(argv[0] || '').trim();
  const globalOpts = parseTermAndOpts(argv.slice(1)).opts;
  const repoRoot = repoRootFromScript(globalOpts.repoRoot || null);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return EXIT.OK;
  }

  const ssotCfg = loadSsotConfig(repoRoot);
  if (ssotCfg.warnings && ssotCfg.warnings.length > 0) {
    for (const warning of ssotCfg.warnings) console.warn(`[warn] ${warning}`);
  }
  const convexConfigured = ssotCfg.mode === 'convex' || exists(path.join(repoRoot, ssotCfg.paths.convexSchema));
  const surfaceLoaded = convexConfigured
    ? loadConvexSurface(repoRoot, ssotCfg)
    : { db: loadNormalizedSchema(repoRoot, ssotCfg), functions: null };
  const loaded = surfaceLoaded.db;

  if (!loaded.schema) {
    const err = loaded.error || 'Failed to load DB schema.';
    console.error(err);
    return EXIT.FAILED;
  }

  const schema = loaded.schema;
  const idx = buildIndex(schema);

  const mirrorExists = exists(loaded.mirrorPath);
  const prismaExists = exists(loaded.prismaPath);
  const convexExists = exists(path.join(repoRoot, ssotCfg.paths.convexSchema));

  const ssotMode = inferSsotMode({ cfgMode: ssotCfg.mode, schema, mirrorExists, prismaExists, convexExists });
  const dialect = (schema.database && schema.database.dialect) ? String(schema.database.dialect) : 'generic';
  const convexFunctionIndex = ssotMode === 'convex'
    ? buildFunctionIndex(surfaceLoaded.functions && surfaceLoaded.functions.contract ? surfaceLoaded.functions.contract : null)
    : null;

  const schemaMeta = {
    repoRoot,
    ssotMode,
    dialect,
    sourceKind: loaded.sourceKind,
    sourcePath: loaded.sourcePath ? path.relative(repoRoot, loaded.sourcePath) : loaded.sourceKind,
    modifyDocRel: '',
    runbookRel: '',
    graph: buildGraphIndex(idx),
    convexFunctions: ssotMode === 'convex'
      ? {
          available: hasConvexFunctionIndex(convexFunctionIndex),
          sourceKind: surfaceLoaded.functions?.sourceKind || 'missing',
          sourcePath: surfaceLoaded.functions?.sourcePath ? path.relative(repoRoot, surfaceLoaded.functions.sourcePath) : null,
          total: convexFunctionIndex?.functions?.length || 0,
          error: surfaceLoaded.functions?.error || null
        }
      : null
  };

  if (cmd === 'status') {
    const cfgNote = ssotCfg.sourcePath ? `(${path.relative(repoRoot, ssotCfg.sourcePath)})` : '(docs/project/db-ssot.json missing)';

    console.log(JSON.stringify({
      repoRoot,
      ssot: {
        mode: ssotMode,
        config: cfgNote,
        paths: ssotCfg.paths,
        warnings: ssotCfg.warnings || []
      },
      schema: {
        sourceKind: loaded.sourceKind,
        sourcePath: loaded.sourcePath ? path.relative(repoRoot, loaded.sourcePath) : null,
        version: schema.version,
        dialect,
        tables: idx.tables.length,
        enums: idx.enums.length
      },
      convexFunctions: ssotMode === 'convex'
        ? {
            sourceKind: schemaMeta.convexFunctions?.sourceKind || 'missing',
            sourcePath: schemaMeta.convexFunctions?.sourcePath,
            available: !!schemaMeta.convexFunctions?.available,
            functions: schemaMeta.convexFunctions?.total || 0,
            error: schemaMeta.convexFunctions?.error || null
          }
        : null
    }, null, 2));
    return EXIT.OK;
  }

  if (cmd === 'search') {
    const term = argv.slice(1).join(' ').trim();
    if (!term) {
      console.error('search requires a <term>.');
      return EXIT.USAGE;
    }

    const candidates = searchCandidates(idx, term, 15, convexFunctionIndex);
    if (!candidates.length) {
      console.log(`No matches found for '${term}'.`);
      return EXIT.OK;
    }

    console.log(mdTable(['Kind', 'Name', 'Score', 'Count'], candidates.map((c) => [c.kind, c.name, String(c.score), c.count ? String(c.count) : ''])));
    return EXIT.OK;
  }

  if (cmd === 'query') {
    const parsedArgs = parseTermAndOpts(argv.slice(1));
    const term = parsedArgs.term;
    const opts = parsedArgs.opts;
    if (!term) {
      console.error('query requires an <object>.');
      return EXIT.USAGE;
    }

    const view = optStr(opts, 'view', 'auto').toLowerCase();
    const depth = optInt(opts, 'depth', 1);
    const maxTables = optInt(opts, 'max-tables', 12);

    const outDir = path.join(repoRoot, '.ai', '.tmp', 'database', 'structure_query');
    let outName = safeSlug(term);
    let doc = '';
    const resolvedFunction = hasConvexFunctionIndex(convexFunctionIndex)
      ? resolveFunctionForQuery(convexFunctionIndex, term)
      : { kind: 'none', term, candidates: [] };

    if (view === 'concept' || view === 'graph') {
      const cluster = buildConceptCluster({
        idx,
        graph: schemaMeta.graph,
        term,
        depth: Math.max(0, Math.min(depth, 3)),
        maxTables: Math.max(2, Math.min(maxTables, 50))
      });

      if (!cluster.ok) {
        outName = safeSlug(`search_${term}`);
        doc = renderSearchDoc({ schemaMeta, term, candidates: cluster.candidates || [] });
      } else {
        outName = safeSlug(term) + (view === 'graph' ? '__graph' : '__concept');
        doc = view === 'graph'
          ? renderGraphDoc({ schemaMeta, cluster })
          : renderConceptDoc({ schemaMeta, idx, cluster });
      }
    } else if (view === 'api') {
      const table = resolveTable(idx, term);
      if (!table) {
        const candidates = searchCandidates(idx, term, 10, convexFunctionIndex);
        outName = safeSlug(term) + '__api';
        doc = [
          `# API view (table not resolved): ${term}`,
          '',
          `- Generated at: \`${toIsoNow()}\``,
          '',
          '## Problem',
          '',
          `The term \`${term}\` could not be resolved to a single table.`,
          '',
          '## Candidates',
          '',
          candidates.length ? mdTable(['Kind', 'Name', 'Score', 'Count'], candidates.map((c) => [c.kind, c.name, String(c.score), c.count ? String(c.count) : ''])) : '_No candidates found._',
          '',
          '## Next step',
          '',
          '- Re-run with an explicit table name:',
          '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <TableName> --view api`'
        ].join('\n');
      } else {
        outName = safeSlug(table.name) + '__api';
        doc = renderApiDoc({ schemaMeta, table });
      }
    } else if (view === 'functions') {
      if (!hasConvexFunctionIndex(convexFunctionIndex)) {
        console.error(schemaMeta.convexFunctions?.error || 'Convex function contract is not available. Run `node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .` first.');
        return EXIT.FAILED;
      }
      const candidates = searchFunctionCandidates(convexFunctionIndex, term, 20);
      outName = safeSlug(term) + '__functions';
      doc = renderFunctionListDoc({ schemaMeta, term, candidates });
    } else if (view === 'surface') {
      if (!hasConvexFunctionIndex(convexFunctionIndex)) {
        console.error(schemaMeta.convexFunctions?.error || 'Convex function contract is not available. Run `node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .` first.');
        return EXIT.FAILED;
      }
      outName = safeSlug(term) + '__surface';
      if (resolvedFunction.kind === 'function') {
        outName = safeSlug(resolvedFunction.fn.functionId || term) + '__surface';
        doc = renderFunctionSurfaceDoc({ schemaMeta, fn: resolvedFunction.fn });
      } else {
        doc = renderFunctionListDoc({ schemaMeta, term, candidates: resolvedFunction.candidates || [] });
      }
    } else {
      // Default / legacy behavior: render the best match (function/table/enum/column/search).
      const resolved = resolveForQuery(idx, term, convexFunctionIndex);
      if (resolvedFunction.kind === 'function') {
        outName = safeSlug(resolvedFunction.fn.functionId || term) + '__surface';
        doc = renderFunctionSurfaceDoc({ schemaMeta, fn: resolvedFunction.fn });
      } else if (resolved.kind === 'table') {
        outName = safeSlug(resolved.table.name);
        doc = renderTableDoc({ schemaMeta, idx, table: resolved.table });
      } else if (resolved.kind === 'enum') {
        outName = safeSlug(resolved.enum.name);
        doc = renderEnumDoc({ schemaMeta, idx, e: resolved.enum });
      } else if (resolved.kind === 'column') {
        outName = safeSlug(resolved.columnName || term);
        doc = renderColumnCrossTableDoc({ schemaMeta, columnName: resolved.columnName || term, matches: resolved.matches || [] });
      } else {
        outName = safeSlug(`search_${term}`);
        doc = renderSearchDoc({ schemaMeta, term, candidates: resolved.candidates || [] });
      }
    }

    const outPath = path.join(outDir, `${outName}.md`);
    writeText(outPath, doc);

    console.log(path.relative(repoRoot, outPath));
    return EXIT.OK;
  }

  if (cmd === 'modify') {
    const parsedArgs = parseTermAndOpts(argv.slice(1));
    const term = parsedArgs.term;
    const opts = parsedArgs.opts;
    if (!term) {
      console.error('modify requires an <object>.');
      return EXIT.USAGE;
    }

    const scope = optStr(opts, 'scope', 'table').toLowerCase();
    const depth = optInt(opts, 'depth', 1);
    const maxTables = optInt(opts, 'max-tables', 12);

    const outDir = path.join(repoRoot, '.ai', '.tmp', 'database', 'structure_modify');

    if (scope === 'concept') {
      const cluster = buildConceptCluster({
        idx,
        graph: schemaMeta.graph,
        term,
        depth: Math.max(0, Math.min(depth, 3)),
        maxTables: Math.max(2, Math.min(maxTables, 50))
      });

      if (!cluster.ok) {
        const candidates = cluster.candidates || searchCandidates(idx, term, 10);
        const outName = safeSlug(term) + '__concept';
        const outPath = path.join(outDir, `${outName}.md`);

        const doc = [
          `# Modify request (concept not resolved): ${term}`,
          '',
          `- Generated at: \`${toIsoNow()}\``,
          '',
          '## Problem',
          '',
          `The term \`${term}\` could not be resolved into a concept cluster (no seed tables).`,
          '',
          '## Candidates',
          '',
          candidates.length ? mdTable(['Kind', 'Name', 'Score', 'Count'], candidates.map((c) => [c.kind, c.name, String(c.score), c.count ? String(c.count) : ''])) : '_No candidates found._',
          '',
          '## Next step',
          '',
          '- Refine the term, or pick a candidate table and run:',
          '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify <TableName>`'
        ].join('\n');

        writeText(outPath, doc);
        console.log(path.relative(repoRoot, outPath));
        return EXIT.OK;
      }

      const outName = safeSlug(term) + '__concept';
      const outPath = path.join(outDir, `${outName}.md`);

      let existingDbops = null;
      if (exists(outPath)) {
        const raw = readText(outPath);
        const parsed = extractDbopsBlock(raw);
        if (parsed.ok) existingDbops = normalizeOps(parsed.obj);
      }

      const doc = renderConceptModifyDoc({ schemaMeta, cluster, existingDbops });
      writeText(outPath, doc);
      console.log(path.relative(repoRoot, outPath));
      return EXIT.OK;
    }

    // Default: table-scoped modify.
    const table = resolveTable(idx, term);
    if (!table) {
      const candidates = searchCandidates(idx, term, 10);
      const outName = safeSlug(term);
      const outPath = path.join(outDir, `${outName}.md`);

      const doc = [
        `# Modify request (table not resolved): ${term}`,
        '',
        `- Generated at: \`${toIsoNow()}\``,
        '',
        '## Problem',
        '',
        `The term \`${term}\` could not be resolved to a single table.`,
        '',
        '## Candidates',
        '',
        candidates.length ? mdTable(['Kind', 'Name', 'Score', 'Count'], candidates.map((c) => [c.kind, c.name, String(c.score), c.count ? String(c.count) : ''])) : '_No candidates found._',
        '',
        '## Next step',
        '',
        '- Re-run with an explicit table name:',
        '  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify <TableName>`'
      ].join('\n');

      writeText(outPath, doc);
      console.log(path.relative(repoRoot, outPath));
      return EXIT.OK;
    }

    const outName = safeSlug(table.name);
    const outPath = path.join(outDir, `${outName}.md`);

    // Preserve existing dbops if present.
    let existingDbops = null;
    if (exists(outPath)) {
      const raw = readText(outPath);
      const parsed = extractDbopsBlock(raw);
      if (parsed.ok) existingDbops = normalizeOps(parsed.obj);
    }

    const doc = renderModifyDoc({ schemaMeta, idx, table, existingDbops });
    writeText(outPath, doc);

    console.log(path.relative(repoRoot, outPath));
    return EXIT.OK;
  }

  if (cmd === 'plan') {
    const parsedArgs = parseTermAndOpts(argv.slice(1));
    const term = parsedArgs.term;
    if (!term) {
      console.error('plan requires an <object>.');
      return EXIT.USAGE;
    }

    const dir = path.join(repoRoot, '.ai', '.tmp', 'database', 'structure_modify');

    const base = safeSlug(term);
    const candidateA = path.join(dir, `${base}.md`);
    const candidateB = path.join(dir, `${base}__concept.md`);

    let modifyPath = null;
    if (exists(candidateA)) modifyPath = candidateA;
    else if (exists(candidateB)) modifyPath = candidateB;
    else {
      // Fallback: if term is a table name, attempt table-derived file name.
      const table = resolveTable(idx, term);
      if (table) {
        const tPath = path.join(dir, `${safeSlug(table.name)}.md`);
        const tPathConcept = path.join(dir, `${safeSlug(table.name)}__concept.md`);
        if (exists(tPath)) modifyPath = tPath;
        else if (exists(tPathConcept)) modifyPath = tPathConcept;
      }
    }

    if (!modifyPath) {
      console.error(
        `Modify doc not found for '${term}'.\n` +
          `Run one of:\n` +
          `- node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify "${term}"\n` +
          `- node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify "${term}" --scope concept`
      );
      return EXIT.FAILED;
    }

    const raw = readText(modifyPath);
    const parsed = extractDbopsBlock(raw);

    const baseName = path.basename(modifyPath, '.md');
    const planPath = path.join(dir, `${baseName}.plan.md`);
    const runbookPath = path.join(dir, `${baseName}.runbook.md`);

    schemaMeta.modifyDocRel = path.relative(repoRoot, modifyPath);
    schemaMeta.runbookRel = path.relative(repoRoot, runbookPath);

    const heading = String(raw.split('\n').find((l) => l.startsWith('# ')) || '').replace(/^#\s*/, '').trim();
    let objectLabel = heading || term;
    const mTable = heading.match(/Modify\s+Table:\s*(.+)/i);
    const mConcept = heading.match(/Modify\s+Concept:\s*(.+)/i);
    if (mTable) objectLabel = `Table ${mTable[1].trim()}`;
    else if (mConcept) objectLabel = `Concept ${mConcept[1].trim()}`;

    let dbops = defaultDbops();
    let problems = [];

    if (!parsed.ok) {
      problems = [{ level: 'error', opIndex: 0, message: parsed.error }];
    } else {
      dbops = normalizeOps(parsed.obj);
      problems = validateOps({ idx, ops: dbops.ops });
    }

    const knownEnums = new Set(idx.enums.map((e) => String(e.name || '')));

    const planDoc = renderPlanDoc({ schemaMeta, idx, objectLabel, dbops, problems, knownEnums });
    writeText(planPath, planDoc);

    if (ssotMode === 'database') {
      const runbookDoc = renderRunbookDoc({ schemaMeta, idx, objectLabel, dbops });
      writeText(runbookPath, runbookDoc);
      console.log(path.relative(repoRoot, planPath));
      console.log(path.relative(repoRoot, runbookPath));
    } else {
      console.log(path.relative(repoRoot, planPath));
    }

    return EXIT.OK;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  return EXIT.USAGE;
}

(async () => {
  try {
    const code = await main();
    process.exit(code);
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(EXIT.FAILED);
  }
})();
