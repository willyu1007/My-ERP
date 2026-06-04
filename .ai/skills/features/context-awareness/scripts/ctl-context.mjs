#!/usr/bin/env node
/**
 * ctl-context.mjs
 *
 * Context artifacts and registry management for the Context Awareness feature.
 *
 * Commands:
 *   init              Initialize docs/context skeleton (idempotent)
 *   add-artifact      Add an artifact to the registry
 *   remove-artifact   Remove an artifact from the registry
 *   touch             Update checksums after editing artifacts
 *   list              List all registered artifacts
 *   verify            Verify context layer consistency
 *   help              Show help
 *   add-env           Add a new environment
 *   list-envs         List all environments
 *   verify-config     Verify environment configuration
 *   add-term          Add a term to the glossary
 *   remove-term       Remove a term from the glossary
 *   list-terms        List glossary terms
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/context-awareness/scripts/ctl-context.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created without writing
    Initialize docs/context skeleton (idempotent).

  add-artifact
    --id <string>               Artifact ID (required)
    --type <openapi|db-schema|db|bpmn|json|yaml|markdown>  Artifact type (required)
    --path <string>             Path to artifact file (required)
    --mode <contract|generated> Artifact mode (default: contract)
    --format <string>           Optional format hint (e.g., openapi-3.1)
    --tags <csv>                Optional tags (comma-separated)
    --repo-root <path>          Repo root (default: cwd)
    Add an artifact to the context registry.

  remove-artifact
    --id <string>               Artifact ID to remove (required)
    --repo-root <path>          Repo root (default: cwd)
    Remove an artifact from the registry.

  touch
    --repo-root <path>          Repo root (default: cwd)
    Update checksums for all registered artifacts.

  list
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List all registered artifacts.

  verify
    --repo-root <path>          Repo root (default: cwd)
    --strict                    Treat warnings as errors
    Verify context layer consistency.

  add-env
    --id <string>               Environment ID (required)
    --description <string>      Description (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a new environment to the registry.

  list-envs
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List all environments.

  verify-config
    --env <string>              Environment to verify (optional, verifies all if omitted)
    --repo-root <path>          Repo root (default: cwd)
    Verify environment configuration.

  add-term
    --term <string>             Term name (required)
    --definition <string>       Definition text (required)
    --scope <string>            Scope: "global" or module name (optional)
    --aliases <csv>             Comma-separated aliases (optional)
    --see-also <csv>            Comma-separated related terms (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a term to docs/context/glossary.json.

  remove-term
    --term <string>             Term name to remove (required)
    --repo-root <path>          Repo root (default: cwd)
    Remove a term from the glossary.

  list-terms
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List all glossary terms.

Examples:
  node .ai/skills/features/context-awareness/scripts/ctl-context.mjs init
  node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-artifact --id my-api --type openapi --path docs/context/api/my-api.yaml
  node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
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

// ============================================================================
// File Utilities
// ============================================================================

function toPosixPath(p) {
  return String(p).replace(/\\/g, '/');
}

function resolvePath(base, p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(base, p);
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return { op: 'mkdir', path: dirPath };
  }
  return { op: 'skip', path: dirPath, reason: 'exists' };
}

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    return { op: 'skip', path: filePath, reason: 'exists' };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

function computeChecksumSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function looksLikeSha256Hex(v) {
  return typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v);
}

function normalizeRegistry(raw) {
  const now = new Date().toISOString();
  const version = Number(raw?.version) || 1;
  const updatedAt = raw?.updatedAt || raw?.lastUpdated || now;
  const artifacts = Array.isArray(raw?.artifacts) ? raw.artifacts : [];

  const normalizedArtifacts = artifacts
    .filter((a) => a && typeof a === 'object')
    .map((a) => {
      const id = String(a.id || '').trim();
      const type = String(a.type || '').trim();
      const artifactPath = String(a.path || '').trim();
      if (!id || !type || !artifactPath) return null;

      const checksumSha256 =
        (looksLikeSha256Hex(a.checksumSha256) && a.checksumSha256.toLowerCase()) ||
        (looksLikeSha256Hex(a.checksum) && a.checksum.toLowerCase()) ||
        undefined;

      const mode = (String(a.mode || 'contract').trim().toLowerCase() === 'generated') ? 'generated' : 'contract';
      const format = a.format ? String(a.format) : undefined;
      const tags = Array.isArray(a.tags) ? a.tags.map((t) => String(t)) : undefined;
      const lastUpdated = a.lastUpdated || a.addedAt || undefined;
      const source = a.source && typeof a.source === 'object' ? a.source : undefined;

      return {
        id,
        type,
        path: toPosixPath(artifactPath),
        mode,
        ...(format ? { format } : {}),
        ...(tags ? { tags } : {}),
        ...(checksumSha256 ? { checksumSha256 } : {}),
        ...(lastUpdated ? { lastUpdated } : {}),
        ...(source ? { source } : {})
      };
    })
    .filter(Boolean);

  return {
    version,
    updatedAt,
    artifacts: normalizedArtifacts
  };
}

function normalizeEnvRegistry(raw) {
  const now = new Date().toISOString();
  const version = Number(raw?.version) || 1;
  const updatedAt = raw?.updatedAt || raw?.lastUpdated || now;
  const environments = Array.isArray(raw?.environments) ? raw.environments : [];

  const normalizedEnvs = environments
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const id = String(e.id || '').trim();
      const description = String(e.description || '').trim();
      if (!id || !description) return null;

      // New schema fields (preferred)
      if (e.database || e.secrets || e.deployment) {
        return {
          id,
          description,
          ...(e.database ? { database: e.database } : {}),
          ...(e.secrets ? { secrets: e.secrets } : {}),
          ...(e.deployment ? { deployment: e.deployment } : {})
        };
      }

      // Legacy mapping from { permissions: { database: { read/write/migrate }, deploy } }
      const perms = e.permissions || {};
      const dbPerms = perms.database || {};
      const deployPerm = perms.deploy;

      const writable = dbPerms.write ?? (id !== 'prod');
      const migrations = dbPerms.migrate ?? (id !== 'prod');
      const seedData = id === 'dev';
      const allowed = deployPerm ?? (id !== 'dev');
      const approval = id === 'prod' ? 'required' : 'optional';

      return {
        id,
        description,
        database: { writable: !!writable, migrations: migrations === true ? true : !!migrations, seedData },
        deployment: { allowed: !!allowed, approval }
      };
    })
    .filter(Boolean);

  return {
    version,
    updatedAt,
    environments: normalizedEnvs
  };
}

// ============================================================================
// Context Management
// ============================================================================

function getContextDir(repoRoot) {
  return path.join(repoRoot, 'docs', 'context');
}

function getRegistryPath(repoRoot) {
  return path.join(getContextDir(repoRoot), 'registry.json');
}

function getEnvRegistryPath(repoRoot) {
  return path.join(getContextDir(repoRoot), 'config', 'environment-registry.json');
}

function loadRegistry(repoRoot) {
  const registryPath = getRegistryPath(repoRoot);
  const data = readJson(registryPath);
  if (!data) return normalizeRegistry(null);
  return normalizeRegistry(data);
}

function saveRegistry(repoRoot, registry) {
  const normalized = normalizeRegistry(registry);
  normalized.updatedAt = new Date().toISOString();
  writeJson(getRegistryPath(repoRoot), normalized);
}

function loadEnvRegistry(repoRoot) {
  const envRegistryPath = getEnvRegistryPath(repoRoot);
  const data = readJson(envRegistryPath);
  if (!data) return normalizeEnvRegistry(null);
  return normalizeEnvRegistry(data);
}

function saveEnvRegistry(repoRoot, envRegistry) {
  const normalized = normalizeEnvRegistry(envRegistry);
  normalized.updatedAt = new Date().toISOString();
  writeJson(getEnvRegistryPath(repoRoot), normalized);
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const contextDir = getContextDir(repoRoot);
  const actions = [];

  // Create directory structure
  const dirs = [
    contextDir,
    path.join(contextDir, 'api'),
    path.join(contextDir, 'db'),
    path.join(contextDir, 'process'),
    path.join(contextDir, 'config')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create INDEX.md
  const indexPath = path.join(contextDir, 'INDEX.md');
  const indexContent = `# Context Index

This directory contains structured context artifacts for AI/LLM consumption.

## Entry Points

- \`registry.json\` - Artifact registry with checksums
- \`config/environment-registry.json\` - Environment configuration

## Artifact Types

| Directory | Purpose |
|-----------|---------|
| \`api/\` | OpenAPI/Swagger specifications |
| \`db/\` | Database schema mirrors |
| \`process/\` | BPMN/workflow definitions |
| \`config/\` | Environment and runtime configuration |

## Usage

AI/LLM should:
1. If \`docs/context/AGENTS.md\` exists, read it first; otherwise read this INDEX.md
2. Check registry.json for available artifacts
3. Load specific artifacts as needed

All context changes go through \`ctl-context.mjs\` commands.
`;

  if (dryRun) {
    actions.push({ op: 'write', path: indexPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(indexPath, indexContent));
  }

  // Create registry.json
  const registryPath = getRegistryPath(repoRoot);
  if (!fs.existsSync(registryPath) && !dryRun) {
    const registry = {
      version: 1,
      updatedAt: new Date().toISOString(),
      artifacts: []
    };
    writeJson(registryPath, registry);
    actions.push({ op: 'write', path: registryPath });
  } else if (dryRun) {
    actions.push({ op: 'write', path: registryPath, mode: 'dry-run' });
  }

  // Create environment registry
  const envRegistryPath = getEnvRegistryPath(repoRoot);
  if (!fs.existsSync(envRegistryPath) && !dryRun) {
    const envRegistry = {
      version: 1,
      updatedAt: new Date().toISOString(),
      environments: [
        {
          id: 'dev',
          description: 'Local development environment',
          database: { writable: true, migrations: true, seedData: true },
          deployment: { allowed: false, approval: 'none' }
        },
        {
          id: 'staging',
          description: 'Staging/QA environment',
          database: { writable: true, migrations: 'review-required', seedData: false },
          deployment: { allowed: true, approval: 'required' }
        },
        {
          id: 'prod',
          description: 'Production environment',
          database: { writable: false, migrations: 'change-request', seedData: false },
          deployment: { allowed: true, approval: 'required' }
        }
      ]
    };
    writeJson(envRegistryPath, envRegistry);
    actions.push({ op: 'write', path: envRegistryPath });
  } else if (dryRun) {
    actions.push({ op: 'write', path: envRegistryPath, mode: 'dry-run' });
  }

  // Create registry schema
  const schemaPath = path.join(contextDir, 'registry.schema.json');
  const schemaContent = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Project Context Registry",
    "type": "object",
    "additionalProperties": false,
    "required": ["version", "updatedAt", "artifacts"],
    "properties": {
      "version": { "type": "integer", "const": 1 },
      "updatedAt": { "type": "string", "description": "ISO 8601 timestamp" },
      "artifacts": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["id", "type", "path", "mode"],
          "properties": {
            "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$" },
            "type": { "type": "string" },
            "path": { "type": "string" },
            "mode": { "type": "string", "enum": ["contract", "generated"] },
            "format": { "type": "string" },
            "tags": { "type": "array", "items": { "type": "string" } },
            "checksumSha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
            "lastUpdated": { "type": "string", "description": "ISO 8601 timestamp" },
            "source": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "kind": { "type": "string", "enum": ["manual", "command"] },
                "command": { "type": "string" },
                "cwd": { "type": "string" },
                "notes": { "type": "string" }
              }
            }
          }
        }
      }
    }
  };

  if (dryRun) {
    actions.push({ op: 'write', path: schemaPath, mode: 'dry-run' });
  } else {
    if (!fs.existsSync(schemaPath)) {
      writeJson(schemaPath, schemaContent);
      actions.push({ op: 'write', path: schemaPath });
    } else {
      actions.push({ op: 'skip', path: schemaPath, reason: 'exists' });
    }
  }

  console.log('[ok] Context layer initialized.');
  for (const action of actions) {
    const mode = action.mode ? ` (${action.mode})` : '';
    const reason = action.reason ? ` [${action.reason}]` : '';
    console.log(`  ${action.op}: ${path.relative(repoRoot, action.path)}${mode}${reason}`);
  }
}

function normalizeArtifactType(type) {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'db') return 'db-schema';
  return t;
}

function parseCsv(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function cmdAddArtifact(repoRoot, id, type, artifactPath, mode, format, tagsCsv) {
  if (!id) die('[error] --id is required');
  if (!type) die('[error] --type is required');
  if (!artifactPath) die('[error] --path is required');

  const normalizedType = normalizeArtifactType(type);
  const validTypes = ['openapi', 'db-schema', 'bpmn', 'json', 'yaml', 'markdown'];
  if (!validTypes.includes(normalizedType)) {
    die(`[error] --type must be one of: ${validTypes.join(', ')} (or legacy alias: db)`);
  }

  const fullPath = resolvePath(repoRoot, artifactPath);
  if (!fs.existsSync(fullPath)) {
    die(`[error] Artifact file not found: ${artifactPath}`);
  }

  const registry = loadRegistry(repoRoot);
  
  // Check if artifact already exists
  const existing = registry.artifacts.find(a => a.id === id);
  if (existing) {
    die(`[error] Artifact with id "${id}" already exists. Use remove-artifact first.`);
  }

  const checksumSha256 = computeChecksumSha256(fullPath);
  const relativePath = toPosixPath(path.relative(repoRoot, fullPath));
  const now = new Date().toISOString();
  const normalizedMode = String(mode || 'contract').trim().toLowerCase() === 'generated' ? 'generated' : 'contract';
  const tags = parseCsv(tagsCsv);

  registry.artifacts.push({
    id,
    type: normalizedType,
    path: relativePath,
    mode: normalizedMode,
    ...(format ? { format: String(format) } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    checksumSha256,
    lastUpdated: now,
    source: {
      kind: 'command',
      command: 'ctl-context add-artifact',
      cwd: '.'
    }
  });

  saveRegistry(repoRoot, registry);
  console.log(`[ok] Added artifact: ${id} (${normalizedType}) -> ${relativePath}`);
}

function cmdRemoveArtifact(repoRoot, id) {
  if (!id) die('[error] --id is required');

  const registry = loadRegistry(repoRoot);
  const index = registry.artifacts.findIndex(a => a.id === id);
  
  if (index === -1) {
    die(`[error] Artifact with id "${id}" not found.`);
  }

  const removed = registry.artifacts.splice(index, 1)[0];
  saveRegistry(repoRoot, registry);
  console.log(`[ok] Removed artifact: ${id} (was at ${removed.path})`);
}

function cmdTouch(repoRoot) {
  const registry = loadRegistry(repoRoot);
  let updated = 0;

  for (const artifact of registry.artifacts) {
    const fullPath = resolvePath(repoRoot, artifact.path);
    const newChecksum = computeChecksumSha256(fullPath);
    
    if (newChecksum && newChecksum !== artifact.checksumSha256) {
      artifact.checksumSha256 = newChecksum;
      artifact.lastUpdated = new Date().toISOString();
      updated++;
      console.log(`  [updated] ${artifact.id}: ${newChecksum}`);
    }
  }

  if (updated > 0) {
    saveRegistry(repoRoot, registry);
    console.log(`[ok] Updated ${updated} checksum(s).`);
  } else {
    console.log('[ok] All checksums are up to date.');
  }
}

function cmdList(repoRoot, format) {
  const registry = loadRegistry(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`Context Artifacts (${registry.artifacts.length} total):`);
  console.log(`Updated at: ${registry.updatedAt || 'unknown'}\n`);

  if (registry.artifacts.length === 0) {
    console.log('  (no artifacts registered)');
    return;
  }

  for (const artifact of registry.artifacts) {
    console.log(`  [${artifact.type}] ${artifact.id}`);
    console.log(`    Path: ${artifact.path}`);
    console.log(`    Mode: ${artifact.mode}`);
    console.log(`    Checksum: ${artifact.checksumSha256 || 'none'}`);
  }
}

async function cmdVerify(repoRoot, strict) {
  const errors = [];
  const warnings = [];
  const contextDir = getContextDir(repoRoot);

  // Check context directory exists
  if (!fs.existsSync(contextDir)) {
    errors.push('docs/context directory does not exist. Run: ctl-context init');
  }

  // Check registry exists
  const registryPath = getRegistryPath(repoRoot);
  if (!fs.existsSync(registryPath)) {
    errors.push('registry.json does not exist. Run: ctl-context init');
  } else {
    const registry = loadRegistry(repoRoot);

    // Verify each artifact
    for (const artifact of registry.artifacts) {
      const fullPath = resolvePath(repoRoot, artifact.path);
      
      if (!fs.existsSync(fullPath)) {
        errors.push(`Artifact file missing: ${artifact.path} (id: ${artifact.id})`);
        continue;
      }

      const currentChecksum = computeChecksumSha256(fullPath);
      if (artifact.checksumSha256 && currentChecksum !== artifact.checksumSha256) {
        warnings.push(`Checksum mismatch for ${artifact.id}: expected ${artifact.checksumSha256}, got ${currentChecksum}. Run: ctl-context touch`);
      }
    }
  }

  // Check environment registry
  const envRegistryPath = getEnvRegistryPath(repoRoot);
  if (!fs.existsSync(envRegistryPath)) {
    warnings.push('environment-registry.json does not exist.');
  }

  // Check INDEX.md
  const indexPath = path.join(contextDir, 'INDEX.md');
  if (!fs.existsSync(indexPath)) {
    warnings.push('INDEX.md does not exist.');
  }

  // Validate glossary schema (if exists)
  const glossaryIssues = await validateGlossarySchema(repoRoot);
  for (const issue of glossaryIssues) {
    if (issue.level === 'error') errors.push(issue.message);
    else warnings.push(issue.message);
  }

  // Report results
  const ok = errors.length === 0 && (!strict || warnings.length === 0);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (ok) {
    console.log('[ok] Context layer verification passed.');
  } else {
    console.log('[error] Context layer verification failed.');
  }

  process.exit(ok ? 0 : 1);
}

function cmdAddEnv(repoRoot, id, description) {
  if (!id) die('[error] --id is required');

  const envRegistry = loadEnvRegistry(repoRoot);
  
  // Check if environment already exists
  const existing = envRegistry.environments.find(e => e.id === id);
  if (existing) {
    die(`[error] Environment "${id}" already exists.`);
  }

  const defaultApproval = id === 'prod' ? 'required' : (id === 'dev' ? 'none' : 'optional');

  envRegistry.environments.push({
    id,
    description: description || `${id} environment`,
    database: {
      writable: id !== 'prod',
      migrations: id === 'prod' ? 'change-request' : (id === 'staging' ? 'review-required' : true),
      seedData: id === 'dev'
    },
    deployment: {
      allowed: id !== 'dev',
      approval: defaultApproval
    }
  });

  saveEnvRegistry(repoRoot, envRegistry);
  console.log(`[ok] Added environment: ${id}`);
}

function cmdListEnvs(repoRoot, format) {
  const envRegistry = loadEnvRegistry(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(envRegistry, null, 2));
    return;
  }

  console.log(`Environments (${envRegistry.environments.length} total):\n`);

  for (const env of envRegistry.environments) {
    console.log(`  [${env.id}] ${env.description || ''}`);
    const db = env.database || {};
    const deploy = env.deployment || {};
    console.log(`    Database: writable=${db.writable ?? '-'}, migrations=${db.migrations ?? '-'}, seedData=${db.seedData ?? '-'}`);
    console.log(`    Deployment: allowed=${deploy.allowed ?? '-'}, approval=${deploy.approval ?? '-'}`);
  }
}

function cmdVerifyConfig(repoRoot, envId) {
  const envRegistry = loadEnvRegistry(repoRoot);
  const errors = [];
  const warnings = [];

  const envsToCheck = envId 
    ? envRegistry.environments.filter(e => e.id === envId)
    : envRegistry.environments;

  if (envId && envsToCheck.length === 0) {
    die(`[error] Environment "${envId}" not found.`);
  }

  for (const env of envsToCheck) {
    // Check for config template
    const templatePath = path.join(repoRoot, 'config', 'environments', `${env.id}.yaml.template`);
    const configPath = path.join(repoRoot, 'config', 'environments', `${env.id}.yaml`);

    if (!fs.existsSync(templatePath) && !fs.existsSync(configPath)) {
      warnings.push(`No config file found for environment "${env.id}".`);
    }

    // Check minimal policy keys exist
    if (!env.database) warnings.push(`Environment "${env.id}" has no database policy defined.`);
    if (!env.deployment) warnings.push(`Environment "${env.id}" has no deployment policy defined.`);
  }

  // Report results
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('[ok] Environment configuration verification passed.');
  } else if (errors.length === 0) {
    console.log('[ok] Environment configuration verification passed with warnings.');
  } else {
    console.log('[error] Environment configuration verification failed.');
    process.exit(1);
  }
}

// ============================================================================
// Glossary Management
// ============================================================================

function getGlossaryPath(repoRoot) {
  return path.join(getContextDir(repoRoot), 'glossary.json');
}

function getGlossarySchemaPath(repoRoot) {
  return path.join(getContextDir(repoRoot), 'glossary.schema.json');
}

function loadGlossary(repoRoot) {
  const gp = getGlossaryPath(repoRoot);
  const data = readJson(gp);
  if (!data) return null;
  return {
    version: data.version || 1,
    updatedAt: data.updatedAt || new Date().toISOString(),
    terms: Array.isArray(data.terms) ? data.terms : []
  };
}

function saveGlossary(repoRoot, glossary) {
  glossary.updatedAt = new Date().toISOString();
  writeJson(getGlossaryPath(repoRoot), glossary);
}

function cmdAddTerm(repoRoot, term, definition, scope, aliasesCsv, seeAlsoCsv) {
  if (!term) die('[error] --term is required');
  if (!definition) die('[error] --definition is required');

  const glossary = loadGlossary(repoRoot);
  if (!glossary) {
    die('[error] glossary.json not found. Run init Stage C apply with contextAwareness=true.');
  }

  const termLower = term.trim().toLowerCase();
  const existing = glossary.terms.findIndex(t => t.term.toLowerCase() === termLower);
  if (existing >= 0) {
    die(`[error] Term "${term}" already exists (case-insensitive match: "${glossary.terms[existing].term}"). Remove it first.`);
  }

  const entry = { term: term.trim(), definition: definition.trim() };
  if (scope) entry.scope = scope.trim();
  const aliases = parseCsv(aliasesCsv);
  if (aliases.length > 0) entry.aliases = aliases;
  const seeAlso = parseCsv(seeAlsoCsv);
  if (seeAlso.length > 0) entry.see_also = seeAlso;

  glossary.terms.push(entry);
  saveGlossary(repoRoot, glossary);
  console.log(`[ok] Added term: ${term.trim()}`);

  cmdTouch(repoRoot);
}

function cmdRemoveTerm(repoRoot, term) {
  if (!term) die('[error] --term is required');

  const glossary = loadGlossary(repoRoot);
  if (!glossary) {
    die('[error] glossary.json not found. Run init Stage C apply with contextAwareness=true.');
  }

  const termLower = term.trim().toLowerCase();
  const idx = glossary.terms.findIndex(t => t.term.toLowerCase() === termLower);
  if (idx < 0) {
    die(`[error] Term "${term}" not found.`);
  }

  const removed = glossary.terms.splice(idx, 1)[0];
  saveGlossary(repoRoot, glossary);
  console.log(`[ok] Removed term: ${removed.term}`);

  cmdTouch(repoRoot);
}

function cmdListTerms(repoRoot, format) {
  const glossary = loadGlossary(repoRoot);
  if (!glossary) {
    die('[error] glossary.json not found. Run init Stage C apply with contextAwareness=true.');
  }

  if (format === 'json') {
    console.log(JSON.stringify(glossary.terms, null, 2));
    return;
  }

  console.log(`Glossary (${glossary.terms.length} terms):\n`);
  if (glossary.terms.length === 0) {
    console.log('  (no terms defined)');
    return;
  }
  for (const t of glossary.terms) {
    console.log(`  [${t.term}] ${t.definition}`);
    if (t.scope) console.log(`    Scope: ${t.scope}`);
    if (t.aliases?.length) console.log(`    Aliases: ${t.aliases.join(', ')}`);
    if (t.see_also?.length) console.log(`    See also: ${t.see_also.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Glossary schema validation — Ajv-first with built-in fallback
//
// Strategy:
//   1. Try Ajv (+ optionally ajv-formats) for full JSON Schema draft-07.
//   2. If Ajv not available → _validateNode() built-in fallback + info log.
//   3. --strict does NOT require Ajv; it only means warnings → errors.
// ---------------------------------------------------------------------------

async function _tryAjvValidate(data, schema) {
  try {
    const ajvMod = await import('ajv');
    const Ajv = ajvMod.default || ajvMod;
    const ajv = new Ajv({ allErrors: true, strict: false });
    try {
      const fmtMod = await import('ajv-formats');
      const addFormats = fmtMod.default || fmtMod;
      addFormats(ajv);
    } catch { /* ajv-formats optional — format checks skipped */ }
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (valid) return { available: true, issues: [] };
    const issues = validate.errors.map(err => ({
      level: 'error',
      message: `glossary.json${err.instancePath}: ${err.message}`,
    }));
    return { available: true, issues };
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      return { available: false, issues: [] };
    }
    return { available: true, issues: [{ level: 'error', message: `Ajv error: ${err.message}` }] };
  }
}

function _checkType(value, expected) {
  switch (expected) {
    case 'object':  return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':   return Array.isArray(value);
    case 'string':  return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number':  return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null':    return value === null;
    default:        return true;
  }
}

function _validateNode(value, schema, nodePath, issues) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type && !_checkType(value, schema.type)) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    issues.push({ level: 'error', message: `${nodePath}: expected type "${schema.type}", got "${actual}"` });
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ level: 'error', message: `${nodePath}: must be ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}` });
  }

  if (typeof schema.minLength === 'number' && typeof value === 'string' && value.length < schema.minLength) {
    issues.push({ level: 'error', message: `${nodePath}: string length ${value.length} below minimum ${schema.minLength}` });
  }

  if (schema.format === 'date-time' && typeof value === 'string') {
    if (isNaN(Date.parse(value))) {
      issues.push({ level: 'warning', message: `${nodePath}: value does not match date-time format` });
    }
  }

  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (value[key] === undefined || value[key] === null) {
          issues.push({ level: 'error', message: `${nodePath}: missing required property "${key}"` });
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (value[key] !== undefined && value[key] !== null) {
          _validateNode(value[key], propSchema, `${nodePath}.${key}`, issues);
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          issues.push({ level: 'error', message: `${nodePath}: unexpected property "${key}"` });
        }
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      _validateNode(value[i], schema.items, `${nodePath}[${i}]`, issues);
    }
  }
}

async function validateGlossarySchema(repoRoot) {
  const glossaryPath = getGlossaryPath(repoRoot);
  if (!fs.existsSync(glossaryPath)) return [];

  const raw = readJson(glossaryPath);
  if (!raw) return [{ level: 'error', message: 'glossary.json exists but failed to parse as JSON' }];

  const schemaPath = getGlossarySchemaPath(repoRoot);
  if (!fs.existsSync(schemaPath)) {
    return [{ level: 'warning', message: 'glossary.schema.json not found — schema validation skipped' }];
  }
  const schema = readJson(schemaPath);
  if (!schema) {
    return [{ level: 'error', message: 'glossary.schema.json exists but failed to parse — cannot validate glossary' }];
  }

  const ajvResult = await _tryAjvValidate(raw, schema);
  const issues = [];

  if (ajvResult.available) {
    issues.push(...ajvResult.issues);
  } else {
    console.log('[info] Ajv not available — using built-in validator. For full JSON Schema draft-07 compliance: pnpm add -D ajv ajv-formats');
    _validateNode(raw, schema, 'glossary.json', issues);
  }

  if (Array.isArray(raw.terms)) {
    const seen = new Set();
    for (let i = 0; i < raw.terms.length; i++) {
      const t = raw.terms[i];
      if (t?.term && typeof t.term === 'string') {
        const lower = t.term.toLowerCase();
        if (seen.has(lower)) {
          issues.push({ level: 'error', message: `glossary.json.terms[${i}]: duplicate term "${t.term}" (case-insensitive)` });
        }
        seen.add(lower);
      }
    }
  }

  return issues;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();

  switch (command) {
    case 'help':
      usage(0);
      break;
    case 'init':
      cmdInit(repoRoot, !!opts['dry-run']);
      break;
    case 'add-artifact':
      cmdAddArtifact(repoRoot, opts['id'], opts['type'], opts['path'], opts['mode'], opts['format'], opts['tags']);
      break;
    case 'remove-artifact':
      cmdRemoveArtifact(repoRoot, opts['id']);
      break;
    case 'touch':
      cmdTouch(repoRoot);
      break;
    case 'list':
      cmdList(repoRoot, format);
      break;
    case 'verify':
      await cmdVerify(repoRoot, !!opts['strict']);
      break;
    case 'add-env':
      cmdAddEnv(repoRoot, opts['id'], opts['description']);
      break;
    case 'list-envs':
      cmdListEnvs(repoRoot, format);
      break;
    case 'verify-config':
      cmdVerifyConfig(repoRoot, opts['env']);
      break;
    case 'add-term':
      cmdAddTerm(repoRoot, opts['term'], opts['definition'], opts['scope'], opts['aliases'], opts['see-also']);
      break;
    case 'remove-term':
      cmdRemoveTerm(repoRoot, opts['term']);
      break;
    case 'list-terms':
      cmdListTerms(repoRoot, format);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
