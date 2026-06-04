#!/usr/bin/env node
/**
 * ctl-convex.mjs
 *
 * Convex scaffolding + contract generation for Convex-as-SSOT mode.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ensureDir,
  parseArgs,
  readJsonIfExists,
  readTextIfExists,
  resolvePath,
  toPosixPath,
  writeJson,
  writeTextIfMissing,
} from "./lib/file-utils.mjs";
import { extractConvexFunctions, parseConvexSchema } from "./lib/convex-parser.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, "..", "templates");
const CONVEX_PACKAGE_VERSION = "^1.26.2";
const CONVEX_FUNCTIONS_ARTIFACT_ID = "convex-functions";
const CANONICAL_PATHS = Object.freeze({
  schema: "convex/schema.ts",
  dbContract: "docs/context/db/schema.json",
  functionContract: "docs/context/convex/functions.json",
});

function stableStringifyForCompare(value) {
  const seen = new WeakSet();
  function normalize(v) {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(normalize);
      const out = {};
      for (const key of Object.keys(v).sort()) {
        out[key] = normalize(v[key]);
      }
      return out;
    }
    return v;
  }
  return JSON.stringify(normalize(value));
}

function withoutUpdatedAt(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const copy = { ...obj };
  delete copy.updatedAt;
  return copy;
}

function uniqueSorted(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((item) => String(item)))].sort((a, b) => a.localeCompare(b));
}

function diffNamedSet(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((name) => !beforeSet.has(name));
  const removed = before.filter((name) => !afterSet.has(name));
  return { added, removed };
}

function summarizeDbContractDrift(expected, actual) {
  const lines = [];
  const expectedTables = uniqueSorted((expected?.tables || []).map((table) => table?.name).filter(Boolean));
  const actualTables = uniqueSorted((actual?.tables || []).map((table) => table?.name).filter(Boolean));
  if (expectedTables.length !== actualTables.length) {
    lines.push(`DB tables changed: ${actualTables.length} -> ${expectedTables.length}`);
  }
  const tableDiff = diffNamedSet(actualTables, expectedTables);
  if (tableDiff.added.length > 0) lines.push(`DB tables added: ${tableDiff.added.join(", ")}`);
  if (tableDiff.removed.length > 0) lines.push(`DB tables removed: ${tableDiff.removed.join(", ")}`);
  return lines;
}

function normalizeFunctionRecordForCompare(fn) {
  return {
    kind: String(fn?.kind || ""),
    visibility: String(fn?.visibility || ""),
    authKind: String(fn?.auth?.kind || ""),
    tablesRead: uniqueSorted(fn?.tablesRead || []),
    tablesWritten: uniqueSorted(fn?.tablesWritten || []),
    argsValidator: fn?.argsValidator ?? null,
    returnsValidator: fn?.returnsValidator ?? null,
  };
}

function summarizeFunctionContractDrift(expected, actual) {
  const lines = [];
  const expectedFunctions = Array.isArray(expected?.functions) ? expected.functions : [];
  const actualFunctions = Array.isArray(actual?.functions) ? actual.functions : [];
  if (expectedFunctions.length !== actualFunctions.length) {
    lines.push(`Convex functions changed: ${actualFunctions.length} -> ${expectedFunctions.length}`);
  }

  const expectedIds = uniqueSorted(expectedFunctions.map((fn) => fn?.functionId).filter(Boolean));
  const actualIds = uniqueSorted(actualFunctions.map((fn) => fn?.functionId).filter(Boolean));
  const functionDiff = diffNamedSet(actualIds, expectedIds);
  if (functionDiff.added.length > 0) lines.push(`Functions added: ${functionDiff.added.join(", ")}`);
  if (functionDiff.removed.length > 0) lines.push(`Functions removed: ${functionDiff.removed.join(", ")}`);

  const actualById = new Map(actualFunctions.map((fn) => [String(fn?.functionId || ""), fn]));
  for (const fn of expectedFunctions) {
    const functionId = String(fn?.functionId || "");
    if (!functionId || !actualById.has(functionId)) continue;
    const before = normalizeFunctionRecordForCompare(actualById.get(functionId));
    const after = normalizeFunctionRecordForCompare(fn);
    if (before.kind !== after.kind) lines.push(`${functionId}: kind ${before.kind || "none"} -> ${after.kind || "none"}`);
    if (before.visibility !== after.visibility) lines.push(`${functionId}: visibility ${before.visibility || "none"} -> ${after.visibility || "none"}`);
    if (before.authKind !== after.authKind) lines.push(`${functionId}: auth.kind ${before.authKind || "none"} -> ${after.authKind || "none"}`);
    if (stableStringifyForCompare(before.tablesRead) !== stableStringifyForCompare(after.tablesRead)) {
      lines.push(`${functionId}: tablesRead ${before.tablesRead.join("|") || "none"} -> ${after.tablesRead.join("|") || "none"}`);
    }
    if (stableStringifyForCompare(before.tablesWritten) !== stableStringifyForCompare(after.tablesWritten)) {
      lines.push(`${functionId}: tablesWritten ${before.tablesWritten.join("|") || "none"} -> ${after.tablesWritten.join("|") || "none"}`);
    }
    if (stableStringifyForCompare(before.argsValidator) !== stableStringifyForCompare(after.argsValidator)) {
      lines.push(`${functionId}: argsValidator changed`);
    }
    if (stableStringifyForCompare(before.returnsValidator) !== stableStringifyForCompare(after.returnsValidator)) {
      lines.push(`${functionId}: returnsValidator changed`);
    }
    if (lines.length >= 20) break;
  }

  return lines;
}

function writeGeneratedJsonStable(filePath, data) {
  const existing = readJsonIfExists(filePath);
  if (existing && typeof existing === "object") {
    const previous = stableStringifyForCompare(withoutUpdatedAt(existing));
    const next = stableStringifyForCompare(withoutUpdatedAt(data));
    if (previous === next && typeof existing.updatedAt === "string" && existing.updatedAt) {
      data.updatedAt = existing.updatedAt;
    }
  }
  writeJson(filePath, data);
}

function usage(exitCode = 0) {
  const msg = `
Usage: node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>     Repo root (default: cwd)
    --dry-run              Show planned writes without modifying files
    Initialize Convex scaffolding and context skeleton.

  status
    --repo-root <path>     Repo root (default: cwd)
    --format <text|json>   Output format (default: text)
    Show low-level Convex artifact status for troubleshooting.

  verify
    --repo-root <path>     Repo root (default: cwd)
    --strict               Treat warnings as errors
    Verify Convex mode artifacts and source-vs-contract freshness after the public DB refresh flow has run.

Notes:
  Public DB contract refresh is routed only through:
    node .ai/scripts/ctl-db-ssot.mjs sync-to-context
  Internal delegate subcommands used by ctl-db-ssot are intentionally omitted from help.

Examples:
  node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs init --repo-root .
  node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs status --repo-root .
  node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function getRepoRoot(opts) {
  return resolvePath(process.cwd(), opts["repo-root"] || process.cwd());
}

function requireInternalRefreshDelegate(command, repoRoot, opts) {
  if (opts["internal-caller"] === "ctl-db-ssot") return;
  const repoRootArg = toPosixPath(path.resolve(repoRoot));
  die(
    `[error] \`${command}\` is an internal Convex implementation command.\n` +
    `Use the canonical public entrypoint instead:\n` +
    `  node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root ${repoRootArg}`
  );
}

function templateFiles() {
  return [
    ["convex/AGENTS.md", "convex/AGENTS.md"],
    ["convex/README.md", "convex/README.md"],
    ["convex/schema.ts", "convex/schema.ts"],
    ["convex/auth.config.ts", "convex/auth.config.ts"],
    ["docs/context/convex/INDEX.md", "docs/context/convex/INDEX.md"],
    ["docs/context/convex/functions.json", "docs/context/convex/functions.json"],
    ["docs/context/convex/functions.schema.json", "docs/context/convex/functions.schema.json"],
  ];
}

function firstConfiguredPath(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return toPosixPath(value.trim());
    }
  }
  return "";
}

function isPathWithinRepo(repoRoot, targetPath) {
  const rel = path.relative(path.resolve(repoRoot), path.resolve(targetPath));
  if (!rel) return true;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function collectUnsupportedPathWarnings(raw, mode) {
  if (!raw || typeof raw !== "object") return [];

  const warnings = [];
  const compare = (label, value, expected) => {
    const actual = typeof value === "string" ? value.trim() : "";
    if (actual && expected && actual !== expected) {
      warnings.push(`${label}=${actual} is ignored in v1; Convex DB contracts use canonical path ${expected}.`);
    }
  };

  compare("paths.dbContextContract", raw?.paths?.dbContextContract, CANONICAL_PATHS.dbContract);
  compare("paths.convexFunctionsContract", raw?.paths?.convexFunctionsContract, CANONICAL_PATHS.functionContract);
  compare("db.contracts.dbSchema", raw?.db?.contracts?.dbSchema, CANONICAL_PATHS.dbContract);
  compare("db.contracts.convexFunctions", raw?.db?.contracts?.convexFunctions, CANONICAL_PATHS.functionContract);

  return warnings;
}

function findNearestAncestorPath(startDir, filename, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);

  if (!isPathWithinRepo(stop, current) && current !== stop) {
    return null;
  }

  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) return candidate;
    if (current === stop) break;

    const parent = path.dirname(current);
    if (parent === current || !parent.startsWith(stop)) break;
    current = parent;
  }

  return null;
}

function copyTemplates(repoRoot, dryRun = false) {
  const layout = resolveConvexLayout(repoRoot);
  const actions = [];
  const dirs = [
    layout.convexDir,
    path.join(repoRoot, "docs", "context", "db"),
    path.join(repoRoot, "docs", "context", "convex"),
  ];
  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: "mkdir", path: dir, mode: "dry-run" });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  for (const [fromRel, toRel] of templateFiles()) {
    const src = path.join(templatesDir, fromRel);
    const dest = toRel.startsWith("convex/")
      ? path.join(layout.convexDir, path.relative("convex", toRel))
      : path.join(repoRoot, toRel);
    const content = readTextIfExists(src);
    if (content == null) {
      actions.push({ op: "warn", path: src, reason: "missing-template" });
      continue;
    }
    if (dryRun) {
      actions.push({ op: "write", path: dest, mode: "dry-run" });
    } else {
      actions.push(writeTextIfMissing(dest, content));
    }
  }

  return actions;
}

function ensureConvexPackageManifest(repoRoot, dryRun = false) {
  const layout = resolveConvexLayout(repoRoot);
  const pkgPath = layout.packageJsonPath;
  if (!fs.existsSync(pkgPath)) {
    return {
      actions: [{ op: "skip", path: pkgPath, reason: "package.json missing" }],
      warnings: [`${layout.packageJsonRel} is missing; skipping Convex dependency and script injection.`],
    };
  }

  const pkg = readJsonIfExists(pkgPath);
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    return {
      actions: [{ op: "warn", path: pkgPath, reason: "invalid-package-json" }],
      warnings: [`${layout.packageJsonRel} could not be parsed; skipping Convex dependency and script injection.`],
    };
  }

  const next = { ...pkg };
  const warnings = [];
  let changed = false;

  const dependencies = next.dependencies && typeof next.dependencies === "object" && !Array.isArray(next.dependencies)
    ? { ...next.dependencies }
    : {};
  const devDependencies = next.devDependencies && typeof next.devDependencies === "object" && !Array.isArray(next.devDependencies)
    ? { ...next.devDependencies }
    : {};
  const scripts = next.scripts && typeof next.scripts === "object" && !Array.isArray(next.scripts)
    ? { ...next.scripts }
    : {};

  const existingConvexVersion = dependencies.convex || devDependencies.convex || null;
  if (!existingConvexVersion) {
    dependencies.convex = CONVEX_PACKAGE_VERSION;
    next.dependencies = dependencies;
    changed = true;
  }

  const desiredScripts = {
    "convex:dev": "convex dev",
    "convex:codegen": "convex codegen",
  };

  for (const [name, command] of Object.entries(desiredScripts)) {
    if (!Object.prototype.hasOwnProperty.call(scripts, name)) {
      scripts[name] = command;
      changed = true;
      continue;
    }
    if (scripts[name] !== command) {
      warnings.push(`package.json already defines script "${name}" as "${scripts[name]}"; preserving it.`);
    }
  }

  next.scripts = scripts;

  if (!dryRun && changed) {
    writeJson(pkgPath, next);
  }

  const actions = [];
  if (!existingConvexVersion) {
    actions.push({
      op: "update",
      path: pkgPath,
      note: `dependencies.convex=${CONVEX_PACKAGE_VERSION}`,
      ...(dryRun ? { mode: "dry-run" } : {}),
    });
  }
  for (const [name, command] of Object.entries(desiredScripts)) {
    if (!pkg.scripts || !Object.prototype.hasOwnProperty.call(pkg.scripts, name)) {
      actions.push({
        op: "update",
        path: pkgPath,
        note: `scripts.${name}=${command}`,
        ...(dryRun ? { mode: "dry-run" } : {}),
      });
    }
  }
  if (actions.length === 0) {
    actions.push({ op: "skip", path: pkgPath, reason: changed ? "unknown-state" : "package-json-up-to-date" });
  }

  return { actions, warnings };
}

function loadDbSsotConfig(repoRoot) {
  const configPath = path.join(repoRoot, "docs", "project", "db-ssot.json");
  const raw = readJsonIfExists(configPath);
  if (!raw) {
    return {
      path: configPath,
      config: null,
      mode: null,
      sourcePath: CANONICAL_PATHS.schema,
      dbContractPath: CANONICAL_PATHS.dbContract,
      fnContractPath: CANONICAL_PATHS.functionContract,
      warnings: [],
    };
  }
  const db = raw.db || raw;
  const mode = typeof db.ssot === "string"
    ? db.ssot
    : typeof raw.ssot === "string"
      ? raw.ssot
      : null;
  const sourcePath = firstConfiguredPath(db?.source?.path, raw?.paths?.convexSchema, CANONICAL_PATHS.schema) || CANONICAL_PATHS.schema;
  return {
    path: configPath,
    config: raw,
    mode,
    sourcePath,
    dbContractPath: CANONICAL_PATHS.dbContract,
    fnContractPath: CANONICAL_PATHS.functionContract,
    warnings: collectUnsupportedPathWarnings(raw, mode),
  };
}

function inferMode(repoRoot) {
  const schemaPath = path.join(repoRoot, "convex", "schema.ts");
  if (fs.existsSync(schemaPath)) return "convex";
  return "none";
}

function resolveMode(repoRoot) {
  const loaded = loadDbSsotConfig(repoRoot);
  if (loaded.mode === "convex") {
    return { mode: "convex", source: "config", configPath: loaded.path, sourcePath: loaded.sourcePath || "convex/schema.ts" };
  }
  const inferred = inferMode(repoRoot);
  return {
    mode: inferred,
    source: loaded.config ? "infer (non-convex config)" : "infer (no config)",
    configPath: loaded.path,
    sourcePath: loaded.sourcePath || "convex/schema.ts",
  };
}

function resolveConvexLayout(repoRoot) {
  const loaded = loadDbSsotConfig(repoRoot);
  const sourcePath = loaded.sourcePath || CANONICAL_PATHS.schema;
  const schemaPath = resolvePath(repoRoot, sourcePath);
  const convexDir = path.dirname(schemaPath);
  const packageJsonPath =
    findNearestAncestorPath(convexDir, "package.json", repoRoot) ||
    path.join(repoRoot, "package.json");
  const errors = [];

  if (!isPathWithinRepo(repoRoot, schemaPath)) {
    errors.push(`Configured Convex schema path resolves outside repo root: ${sourcePath}`);
  }
  if (!isPathWithinRepo(repoRoot, convexDir)) {
    errors.push(`Configured Convex source directory resolves outside repo root: ${toPosixPath(path.relative(repoRoot, convexDir))}`);
  }
  if (!isPathWithinRepo(repoRoot, packageJsonPath)) {
    errors.push(`Resolved package manifest path escapes repo root: ${toPosixPath(path.relative(repoRoot, packageJsonPath))}`);
  }

  return {
    sourcePath,
    schemaPath,
    schemaRel: toPosixPath(path.relative(repoRoot, schemaPath)),
    convexDir,
    convexDirRel: toPosixPath(path.relative(repoRoot, convexDir)),
    packageJsonPath,
    packageJsonRel: toPosixPath(path.relative(repoRoot, packageJsonPath)),
    dbContractPath: path.join(repoRoot, loaded.dbContractPath || CANONICAL_PATHS.dbContract),
    fnContractPath: path.join(repoRoot, loaded.fnContractPath || CANONICAL_PATHS.functionContract),
    errors,
    warnings: loaded.warnings || [],
  };
}

function assertValidConvexLayout(layout) {
  if (!layout.errors || layout.errors.length === 0) return;
  die(`[error] Invalid Convex layout.\n${layout.errors.map((error) => `- ${error}`).join("\n")}`);
}

function buildStatus(repoRoot) {
  const mode = resolveMode(repoRoot);
  const layout = resolveConvexLayout(repoRoot);
  const schemaPath = layout.schemaPath;
  const dbContractPath = layout.dbContractPath;
  const fnContractPath = layout.fnContractPath;
  const pkgPath = layout.packageJsonPath;
  const pkg = readJsonIfExists(pkgPath);
  const dbContract = readJsonIfExists(dbContractPath);
  const fnContract = readJsonIfExists(fnContractPath);

  return {
    mode: mode.mode,
    modeSource: mode.source,
    dbSsotConfig: toPosixPath(path.relative(repoRoot, mode.configPath)),
    sourcePath: layout.schemaRel,
    artifacts: {
      schema: {
        exists: fs.existsSync(schemaPath),
        path: layout.schemaRel,
      },
      dbContract: {
        exists: fs.existsSync(dbContractPath),
        path: toPosixPath(path.relative(repoRoot, dbContractPath)),
        tables: Array.isArray(dbContract?.tables) ? dbContract.tables.length : null,
      },
      functionContract: {
        exists: fs.existsSync(fnContractPath),
        path: toPosixPath(path.relative(repoRoot, fnContractPath)),
        functions: Array.isArray(fnContract?.functions) ? fnContract.functions.length : null,
      },
      packageJson: {
        exists: fs.existsSync(pkgPath),
        path: layout.packageJsonRel,
        hasConvexDependency: !!(pkg?.dependencies?.convex || pkg?.devDependencies?.convex),
        hasConvexDevScript: pkg?.scripts?.["convex:dev"] === "convex dev",
        hasConvexCodegenScript: pkg?.scripts?.["convex:codegen"] === "convex codegen",
      },
      generated: {
        exists: fs.existsSync(path.join(layout.convexDir, "_generated")),
        path: toPosixPath(path.relative(repoRoot, path.join(layout.convexDir, "_generated"))),
      },
    },
    errors: layout.errors,
    warnings: layout.warnings,
  };
}

function cmdInit(repoRoot, dryRun) {
  assertValidConvexLayout(resolveConvexLayout(repoRoot));
  const actions = copyTemplates(repoRoot, dryRun);
  const pkg = ensureConvexPackageManifest(repoRoot, dryRun);
  actions.push(...pkg.actions);

  console.log("[ok] Convex skeleton initialized.");
  for (const action of actions) {
    const rel = action.path ? toPosixPath(path.relative(repoRoot, action.path)) : "";
    const mode = action.mode ? ` (${action.mode})` : "";
    const reason = action.reason ? ` [${action.reason}]` : "";
    const note = action.note ? ` {${action.note}}` : "";
    console.log(`  ${action.op}: ${rel}${mode}${reason}${note}`);
  }
  for (const warning of pkg.warnings) {
    console.log(`[warn] ${warning}`);
  }
}

function maybeRegisterConvexFunctionsArtifact(repoRoot, fnOutPath) {
  const registryPath = path.join(repoRoot, "docs", "context", "registry.json");
  if (!fs.existsSync(registryPath)) {
    return { status: "skipped", reason: "context registry missing" };
  }

  const registry = readJsonIfExists(registryPath);
  if (!registry || !Array.isArray(registry.artifacts)) {
    return { status: "skipped", reason: "invalid context registry" };
  }

  if (registry.artifacts.some((artifact) => artifact && artifact.id === CONVEX_FUNCTIONS_ARTIFACT_ID)) {
    return { status: "skipped", reason: "artifact already registered" };
  }

  const contextCtl = path.join(repoRoot, ".ai", "skills", "features", "context-awareness", "scripts", "ctl-context.mjs");
  if (!fs.existsSync(contextCtl)) {
    return { status: "skipped", reason: "ctl-context.mjs missing" };
  }

  const relPath = toPosixPath(path.relative(repoRoot, fnOutPath));
  const res = spawnSync("node", [
    contextCtl,
    "add-artifact",
    "--repo-root",
    repoRoot,
    "--id",
    CONVEX_FUNCTIONS_ARTIFACT_ID,
    "--type",
    "json",
    "--path",
    relPath,
    "--mode",
    "generated",
    "--format",
    "convex-functions-v1",
    "--tags",
    "db,convex,llm",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (res.status !== 0) {
    const message = String(res.stderr || res.stdout || "").trim();
    return { status: "failed", reason: message || "ctl-context add-artifact failed" };
  }

  return { status: "registered", path: relPath };
}

function cmdSyncToContext(repoRoot, schemaPathOpt, dbOutOpt, fnOutOpt) {
  const layout = resolveConvexLayout(repoRoot);
  assertValidConvexLayout(layout);
  const schemaPath = resolvePath(repoRoot, schemaPathOpt || layout.sourcePath);
  if (!fs.existsSync(schemaPath)) {
    die(`[error] Convex schema not found: ${toPosixPath(path.relative(repoRoot, schemaPath))}`);
  }

  if (dbOutOpt) {
    const requestedDbOut = resolvePath(repoRoot, dbOutOpt);
    const requestedDbRel = toPosixPath(path.relative(repoRoot, requestedDbOut));
    if (requestedDbRel !== CANONICAL_PATHS.dbContract) {
      die(`[error] ctl-convex v1 uses fixed DB contract path ${CANONICAL_PATHS.dbContract}; custom --db-out is not supported.`);
    }
  }
  if (fnOutOpt) {
    const requestedFnOut = resolvePath(repoRoot, fnOutOpt);
    const requestedFnRel = toPosixPath(path.relative(repoRoot, requestedFnOut));
    if (requestedFnRel !== CANONICAL_PATHS.functionContract) {
      die(`[error] ctl-convex v1 uses fixed function contract path ${CANONICAL_PATHS.functionContract}; custom --fn-out is not supported.`);
    }
  }

  const dbOut = resolvePath(repoRoot, CANONICAL_PATHS.dbContract);
  const fnOut = resolvePath(repoRoot, CANONICAL_PATHS.functionContract);
  const schemaText = readTextIfExists(schemaPath) || "";
  const convexDir = path.dirname(schemaPath);

  const dbContract = parseConvexSchema(schemaText, {
    sourcePath: toPosixPath(path.relative(repoRoot, schemaPath)),
  });
  const functionContract = extractConvexFunctions({ repoRoot, convexDir });

  writeGeneratedJsonStable(dbOut, dbContract);
  writeGeneratedJsonStable(fnOut, functionContract);
  const registryResult = maybeRegisterConvexFunctionsArtifact(repoRoot, fnOut);

  console.log("[ok] Convex context contracts refreshed.");
  console.log(`  db: ${toPosixPath(path.relative(repoRoot, dbOut))} (tables: ${dbContract.tables.length})`);
  console.log(`  functions: ${toPosixPath(path.relative(repoRoot, fnOut))} (functions: ${functionContract.functions.length})`);
  console.log(`  schema source: ${toPosixPath(path.relative(repoRoot, schemaPath))}`);
  for (const warning of layout.warnings || []) {
    console.log(`[warn] ${warning}`);
  }
  if (registryResult.status === "registered") {
    console.log(`  registry: ${registryResult.path} (registered as ${CONVEX_FUNCTIONS_ARTIFACT_ID})`);
  } else if (registryResult.status === "failed") {
    console.log(`[warn] Convex function artifact registration failed: ${registryResult.reason}`);
  }
}

function cmdExtractFunctions(repoRoot, outOpt) {
  const layout = resolveConvexLayout(repoRoot);
  assertValidConvexLayout(layout);
  if (outOpt) {
    const requestedOut = resolvePath(repoRoot, outOpt);
    const requestedRel = toPosixPath(path.relative(repoRoot, requestedOut));
    if (requestedRel !== CANONICAL_PATHS.functionContract) {
      die(`[error] ctl-convex v1 uses fixed function contract path ${CANONICAL_PATHS.functionContract}; custom --out is not supported.`);
    }
  }
  const out = resolvePath(repoRoot, CANONICAL_PATHS.functionContract);
  const functionContract = extractConvexFunctions({ repoRoot, convexDir: layout.convexDir });
  writeGeneratedJsonStable(out, functionContract);
  console.log("[ok] Convex function contract refreshed.");
  console.log(`  path: ${toPosixPath(path.relative(repoRoot, out))}`);
  console.log(`  functions: ${functionContract.functions.length}`);
  console.log(`  source: ${layout.convexDirRel}/`);
  for (const warning of layout.warnings || []) {
    console.log(`[warn] ${warning}`);
  }
}

function cmdStatus(repoRoot, format = "text") {
  const status = buildStatus(repoRoot);
  if (format === "json") {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log("Convex status (low-level troubleshooting view)");
  console.log("  public SSOT status: node .ai/scripts/ctl-db-ssot.mjs status --repo-root .");
  console.log(`  mode: ${status.mode} (${status.modeSource})`);
  console.log(`  db-ssot: ${status.dbSsotConfig}`);
  console.log(`  sourcePath: ${status.sourcePath}`);
  console.log(`  package.json path: ${status.artifacts.packageJson.path}`);
  console.log(`  schema: ${status.artifacts.schema.exists ? "yes" : "no"} (${status.artifacts.schema.path})`);
  console.log(`  db contract: ${status.artifacts.dbContract.exists ? "yes" : "no"} (${status.artifacts.dbContract.path})`);
  console.log(`  function contract: ${status.artifacts.functionContract.exists ? "yes" : "no"} (${status.artifacts.functionContract.path})`);
  console.log(`  package.json: ${status.artifacts.packageJson.exists ? "yes" : "no"} (${status.artifacts.packageJson.path})`);
  console.log(`  generated: ${status.artifacts.generated.exists ? "yes" : "no"} (${status.artifacts.generated.path})`);
  if (status.errors && status.errors.length > 0) {
    for (const error of status.errors) {
      console.log(`[error] ${error}`);
    }
  }
  if (status.warnings.length > 0) {
    for (const warning of status.warnings) {
      console.log(`[warn] ${warning}`);
    }
  }
}

function cmdVerify(repoRoot, strict = false) {
  const errors = [];
  const warnings = [];
  const advisories = [];

  const mode = resolveMode(repoRoot);
  const layout = resolveConvexLayout(repoRoot);
  const schemaPath = layout.schemaPath;
  const dbContractPath = layout.dbContractPath;
  const fnContractPath = layout.fnContractPath;
  const pkgPath = layout.packageJsonPath;
  const pkg = readJsonIfExists(pkgPath);

  if (mode.mode !== "convex") {
    errors.push(`Resolved DB SSOT mode is "${mode.mode}", not "convex".`);
  }
  if (layout.errors && layout.errors.length > 0) {
    errors.push(...layout.errors);
  }
  if (layout.warnings && layout.warnings.length > 0) {
    errors.push(...layout.warnings.map((warning) => `Unsupported db-ssot path override: ${warning}`));
  }

  if (!fs.existsSync(schemaPath)) {
    errors.push(`Missing ${layout.schemaRel}`);
  }

  if (fs.existsSync(pkgPath)) {
    if (!(pkg?.dependencies?.convex || pkg?.devDependencies?.convex)) {
      errors.push(`${layout.packageJsonRel} is present but does not declare the "convex" package.`);
    }
    if (pkg?.scripts?.["convex:dev"] !== "convex dev") {
      advisories.push(`${layout.packageJsonRel} script "convex:dev" is missing or customized.`);
    }
    if (pkg?.scripts?.["convex:codegen"] !== "convex codegen") {
      advisories.push(`${layout.packageJsonRel} script "convex:codegen" is missing or customized.`);
    }
  } else {
    errors.push(`Missing ${layout.packageJsonRel}; Convex expects a package.json near the configured schema source.`);
  }

  const dbContract = readJsonIfExists(dbContractPath);
  if (!dbContract) {
    errors.push("Missing docs/context/db/schema.json");
  } else {
    const sourceKind = dbContract?.ssot?.source?.kind || dbContract?.source?.kind || null;
    if (sourceKind && sourceKind !== "convex-schema") {
      warnings.push(`docs/context/db/schema.json was generated from source kind "${sourceKind}", not "convex-schema".`);
    }
  }

  const fnContract = readJsonIfExists(fnContractPath);
  if (!fnContract) {
    errors.push("Missing docs/context/convex/functions.json");
  } else if (!Array.isArray(fnContract.functions)) {
    errors.push("docs/context/convex/functions.json does not contain a top-level functions[] array");
  }

  if (!fs.existsSync(path.join(layout.convexDir, "_generated"))) {
    warnings.push(`${layout.convexDirRel}/_generated is missing; run \`npx convex dev\` or \`npx convex codegen\` if typed surfaces changed.`);
  }

  if (errors.length === 0 && dbContract && fnContract && Array.isArray(fnContract.functions) && fs.existsSync(schemaPath)) {
    const schemaText = readTextIfExists(schemaPath) || "";
    const expectedDbContract = parseConvexSchema(schemaText, {
      sourcePath: toPosixPath(path.relative(repoRoot, schemaPath)),
    });
    const expectedFnContract = extractConvexFunctions({ repoRoot, convexDir: layout.convexDir });

    const actualDbComparable = stableStringifyForCompare(withoutUpdatedAt(dbContract));
    const expectedDbComparable = stableStringifyForCompare(withoutUpdatedAt(expectedDbContract));
    if (actualDbComparable !== expectedDbComparable) {
      const driftLines = summarizeDbContractDrift(expectedDbContract, dbContract);
      warnings.push("docs/context/db/schema.json is out of date with current Convex schema.");
      if (driftLines.length > 0) warnings.push(...driftLines.map((line) => `drift: ${line}`));
      else warnings.push("drift: DB contract contents changed.");
    }

    const actualFnComparable = stableStringifyForCompare(withoutUpdatedAt(fnContract));
    const expectedFnComparable = stableStringifyForCompare(withoutUpdatedAt(expectedFnContract));
    if (actualFnComparable !== expectedFnComparable) {
      const driftLines = summarizeFunctionContractDrift(expectedFnContract, fnContract);
      warnings.push("docs/context/convex/functions.json is out of date with current Convex source.");
      if (driftLines.length > 0) warnings.push(...driftLines.map((line) => `drift: ${line}`));
      else warnings.push("drift: Convex function contract contents changed.");
    }
  }

  if (errors.length === 0 && (warnings.length === 0 || !strict)) {
    console.log("[ok] Convex verification passed.");
  }

  if (advisories.length > 0) {
    for (const advisory of advisories) {
      console.log(`[info] ${advisory}`);
    }
  }
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(`[warn] ${warning}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[error] ${error}`);
    }
    process.exit(1);
  }

  if (strict && warnings.length > 0) {
    process.exit(2);
  }
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  if (command === "help") usage(0);

  const repoRoot = getRepoRoot(opts);

  switch (command) {
    case "init":
      cmdInit(repoRoot, !!opts["dry-run"]);
      break;
    case "status":
      cmdStatus(repoRoot, opts["format"] || "text");
      break;
    case "sync-to-context":
      requireInternalRefreshDelegate("sync-to-context", repoRoot, opts);
      cmdSyncToContext(repoRoot, opts["schema-path"], opts["db-out"], opts["fn-out"]);
      break;
    case "extract-functions":
      requireInternalRefreshDelegate("extract-functions", repoRoot, opts);
      cmdExtractFunctions(repoRoot, opts["out"]);
      break;
    case "verify":
      cmdVerify(repoRoot, !!opts["strict"]);
      break;
    default:
      usage(1);
  }
}

main();
