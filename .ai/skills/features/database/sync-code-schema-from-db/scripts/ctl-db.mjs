#!/usr/bin/env node
/**
 * ctl-db.mjs
 *
 * DB schema and mirror management for the sync-code-schema-from-db feature.
 *
 * Commands:
 *   init                 Initialize db/ skeleton (idempotent)
 *   import-prisma        Import schema from prisma/schema.prisma to db/schema/tables.json
 *   generate-migration   Generate a new migration file
 *   verify               Verify db configuration and schema consistency
 *   status               Show current db status
 *   help                 Show help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize db/ skeleton (idempotent).

  import-prisma
    --repo-root <path>          Repo root (default: cwd)
    --prisma-path <path>        Path to schema.prisma (default: prisma/schema.prisma)
    --dry-run                   Show what would be imported
    Import schema from Prisma to db/schema/tables.json.

  generate-migration
    --name <string>             Migration name (required, e.g. add_users)
    --repo-root <path>          Repo root (default: cwd)
    Generate a new timestamped migration file.

  verify
    --repo-root <path>          Repo root (default: cwd)
    --strict                    Treat warnings as errors
    Verify db configuration and schema consistency.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show current db status.

Examples:
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs generate-migration --name add_users
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs verify
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs status
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

// ============================================================================
// Schema Parsing (Lightweight Prisma Parser)
// ============================================================================

function parsePrismaSchema(content) {
  const schema = {
    version: 2,
    updatedAt: new Date().toISOString(),
    ssot: {
      mode: 'database',
      source: {
        kind: 'prisma-schema',
        path: 'prisma/schema.prisma'
      }
    },
    database: {
      kind: 'relational',
      dialect: 'generic',
      name: '',
      schemas: []
    },
    enums: [],
    tables: [],
    notes: 'Imported from Prisma schema.'
  };

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let currentModel = null;
  let currentEnum = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('//')) continue;

    // Datasource for dialect detection
    if (trimmed.startsWith('datasource')) {
      // Look for provider in subsequent lines
      for (let j = i + 1; j < lines.length && j < i + 10; j++) {
        const sub = lines[j].trim();
        if (sub.includes('provider')) {
          const m = sub.match(/provider\s*=\s*"([^"]+)"/);
          if (m) {
            schema.database.dialect = m[1];
          }
        }
        if (sub === '}') break;
      }
    }

    // Model start
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        dbName: null,
        schema: null,
        columns: [],
        relations: [],
        indexes: []
      };
      braceDepth = 1;
      continue;
    }

    // Enum start
    const enumMatch = trimmed.match(/^enum\s+(\w+)\s*\{/);
    if (enumMatch) {
      currentEnum = {
        name: enumMatch[1],
        values: []
      };
      braceDepth = 1;
      continue;
    }

    // Track braces
    if (currentModel || currentEnum) {
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;
      braceDepth += opens - closes;

      if (braceDepth <= 0) {
        if (currentModel) {
          schema.tables.push(currentModel);
          currentModel = null;
        }
        if (currentEnum) {
          schema.enums.push(currentEnum);
          currentEnum = null;
        }
        braceDepth = 0;
        continue;
      }
    }

    // Parse model fields
    if (currentModel && braceDepth > 0) {
      // Model-level @@map
      const mapMatch = trimmed.match(/@@map\("([^"]+)"\)/);
      if (mapMatch) {
        currentModel.dbName = mapMatch[1];
        continue;
      }

      // Model-level @@schema
      const schemaMatch = trimmed.match(/@@schema\("([^"]+)"\)/);
      if (schemaMatch) {
        currentModel.schema = schemaMatch[1];
        continue;
      }

      // @@index / @@unique
      const indexMatch = trimmed.match(/@@(index|unique)\(\[([^\]]+)\](?:,\s*(?:name|map)\s*:\s*"([^"]+)")?\)/);
      if (indexMatch) {
        const fields = indexMatch[2].split(',').map(f => f.trim());
        currentModel.indexes.push({
          type: indexMatch[1],
          fields,
          name: indexMatch[3] || null,
          map: null
        });
        continue;
      }

      // @@id (composite primary key)
      const idMatch = trimmed.match(/@@id\(\[([^\]]+)\]\)/);
      if (idMatch) {
        const fields = idMatch[1].split(',').map(f => f.trim());
        currentModel.indexes.push({
          type: 'primary',
          fields,
          name: null,
          map: null
        });
        continue;
      }

      // Field line (simple parser)
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\??(.*)$/);
      if (fieldMatch && !trimmed.startsWith('@')) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        const isList = !!fieldMatch[3];
        const rest = fieldMatch[4] || '';

        const nullable = !isList && rest.includes('?') === false && !rest.includes('@id') && rest.includes('?') === false;

        // Check for relation
        const relationMatch = rest.match(/@relation\(([^)]*)\)/);
        if (relationMatch) {
          const relArgs = relationMatch[1];
          const fieldsMatch = relArgs.match(/fields:\s*\[([^\]]+)\]/);
          const refsMatch = relArgs.match(/references:\s*\[([^\]]+)\]/);
          const nameMatch = relArgs.match(/name:\s*"([^"]+)"/);

          currentModel.relations.push({
            field: fieldName,
            to: fieldType,
            optional: rest.includes('?'),
            list: isList,
            fields: fieldsMatch ? fieldsMatch[1].split(',').map(f => f.trim()) : [],
            references: refsMatch ? refsMatch[1].split(',').map(f => f.trim()) : [],
            relationName: nameMatch ? nameMatch[1] : null
          });
        } else {
          // Regular column
          const column = {
            name: fieldName,
            type: fieldType,
            nullable: rest.includes('?') && !rest.includes('@id'),
            list: isList,
            dbName: null,
            dbType: null,
            default: null,
            primaryKey: rest.includes('@id'),
            unique: rest.includes('@unique'),
            constraints: []
          };

          // @map
          const colMapMatch = rest.match(/@map\("([^"]+)"\)/);
          if (colMapMatch) column.dbName = colMapMatch[1];

          // @db.Type
          const dbTypeMatch = rest.match(/@db\.(\w+)(?:\(([^)]+)\))?/);
          if (dbTypeMatch) column.dbType = dbTypeMatch[2] ? `${dbTypeMatch[1]}(${dbTypeMatch[2]})` : dbTypeMatch[1];

          // @default
          const defaultMatch = rest.match(/@default\(([^)]+)\)/);
          if (defaultMatch) column.default = defaultMatch[1];

          currentModel.columns.push(column);
        }
      }
    }

    // Parse enum values
    if (currentEnum && braceDepth > 0) {
      if (trimmed && !trimmed.startsWith('//') && !trimmed.includes('{') && !trimmed.includes('}')) {
        currentEnum.values.push(trimmed);
      }
    }
  }

  return schema;
}

// ============================================================================
// DB Management
// ============================================================================

function getDbDir(repoRoot) {
  return path.join(repoRoot, 'db');
}

function getSchemaDir(repoRoot) {
  return path.join(getDbDir(repoRoot), 'schema');
}

function getMigrationsDir(repoRoot) {
  return path.join(getDbDir(repoRoot), 'migrations');
}

function getTablesJsonPath(repoRoot) {
  return path.join(getSchemaDir(repoRoot), 'tables.json');
}

function loadTablesJson(repoRoot) {
  return readJson(getTablesJsonPath(repoRoot));
}

function saveTablesJson(repoRoot, data) {
  writeJson(getTablesJsonPath(repoRoot), data);
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const dbDir = getDbDir(repoRoot);
  const actions = [];

  // Create directories
  const dirs = [
    dbDir,
    path.join(dbDir, 'schema'),
    path.join(dbDir, 'migrations'),
    path.join(dbDir, 'config')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create AGENTS.md
  const agentsPath = path.join(dbDir, 'AGENTS.md');
  const agentsContent = `# Database Schema Mirror (LLM-first)

## Purpose

This directory contains the database schema mirror when the real database is the source of truth (DB SSOT mode).

## Commands

\`\`\`bash
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs generate-migration --name <name>
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs verify
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs status
\`\`\`

## Structure

- \`schema/tables.json\` - Normalized schema mirror (v2 format)
- \`migrations/\` - SQL migration files
- \`config/\` - DB configuration and state

## Guidelines

- Do NOT manually edit \`tables.json\`; use \`import-prisma\` after pulling from DB.
- Migration files should be applied manually by humans.
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  // Create initial tables.json if missing
  const tablesPath = getTablesJsonPath(repoRoot);
  if (!fs.existsSync(tablesPath) && !dryRun) {
    const initialSchema = {
      version: 2,
      updatedAt: new Date().toISOString(),
      ssot: {
        mode: 'database',
        source: {
          kind: 'db-mirror',
          path: 'db/schema/tables.json'
        }
      },
      database: {
        kind: 'relational',
        dialect: 'generic',
        name: '',
        schemas: []
      },
      enums: [],
      tables: [],
      notes: 'Initial empty schema. Run import-prisma to populate.'
    };
    saveTablesJson(repoRoot, initialSchema);
    actions.push({ op: 'write', path: tablesPath });
  } else if (dryRun) {
    actions.push({ op: 'write', path: tablesPath, mode: 'dry-run' });
  }

  console.log('[ok] DB skeleton initialized.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdImportPrisma(repoRoot, prismaPath, dryRun) {
  const schemaPath = prismaPath || path.join(repoRoot, 'prisma', 'schema.prisma');

  if (!fs.existsSync(schemaPath)) {
    die(`[error] Prisma schema not found at: ${schemaPath}`);
  }

  const content = fs.readFileSync(schemaPath, 'utf8');
  const schema = parsePrismaSchema(content);

  schema.ssot.source.path = path.relative(repoRoot, schemaPath);
  schema.updatedAt = new Date().toISOString();

  if (dryRun) {
    console.log('[dry-run] Would write:');
    console.log(`  Tables: ${schema.tables.length}`);
    console.log(`  Enums: ${schema.enums.length}`);
    console.log(`  Dialect: ${schema.database.dialect}`);
    return;
  }

  saveTablesJson(repoRoot, schema);

  console.log('[ok] Imported Prisma schema to db/schema/tables.json');
  console.log(`  Tables: ${schema.tables.length}`);
  console.log(`  Enums: ${schema.enums.length}`);
  console.log(`  Dialect: ${schema.database.dialect}`);
}

function cmdGenerateMigration(repoRoot, name) {
  if (!name) {
    die('[error] --name is required');
  }

  // Validate name (only alphanumeric and underscores)
  if (!/^[a-z0-9_]+$/i.test(name)) {
    die('[error] Migration name should only contain letters, numbers, and underscores');
  }

  const migrationsDir = getMigrationsDir(repoRoot);
  ensureDir(migrationsDir);

  // Generate timestamp YYYYMMDDHHMMSS
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);

  const filename = `${timestamp}_${name}.sql`;
  const filepath = path.join(migrationsDir, filename);

  if (fs.existsSync(filepath)) {
    die(`[error] Migration file already exists: ${filename}`);
  }

  const template = `-- Migration: ${name}
-- Created: ${now.toISOString()}
--
-- Instructions:
-- 1. Add your forward migration SQL below
-- 2. Test in a development environment first
-- 3. Apply using your preferred tool (psql, mysql, etc.)
-- 4. Run: node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs mark-applied --migration ${filename} --env <env>

-- === FORWARD MIGRATION ===

-- Add your SQL statements here


-- === ROLLBACK (optional, for reference) ===

-- Uncomment and modify if you need rollback capability
-- DROP TABLE IF EXISTS ...;
`;

  fs.writeFileSync(filepath, template, 'utf8');

  console.log(`[ok] Generated migration: ${filename}`);
  console.log(`  Path: ${path.relative(repoRoot, filepath)}`);
}

function cmdVerify(repoRoot, strict) {
  const errors = [];
  const warnings = [];

  // Check db directory
  const dbDir = getDbDir(repoRoot);
  if (!fs.existsSync(dbDir)) {
    errors.push('db/ directory not found. Run: ctl-db init');
  }

  // Check tables.json
  const tablesPath = getTablesJsonPath(repoRoot);
  if (!fs.existsSync(tablesPath)) {
    errors.push('db/schema/tables.json not found. Run: ctl-db init');
  } else {
    const schema = loadTablesJson(repoRoot);
    if (!schema) {
      errors.push('db/schema/tables.json is invalid JSON');
    } else {
      if (!schema.version) warnings.push('tables.json missing version field');
      if (!schema.tables || !Array.isArray(schema.tables)) {
        errors.push('tables.json missing or invalid tables array');
      } else if (schema.tables.length === 0) {
        warnings.push('tables.json has no tables defined');
      }
    }
  }

  // Check migrations directory
  const migrationsDir = getMigrationsDir(repoRoot);
  if (!fs.existsSync(migrationsDir)) {
    warnings.push('db/migrations/ directory not found');
  }

  // Report
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const ok = errors.length === 0 && (!strict || warnings.length === 0);
  console.log(ok ? '[ok] DB verification passed.' : '[error] DB verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdStatus(repoRoot, format) {
  const dbDir = getDbDir(repoRoot);
  const tablesPath = getTablesJsonPath(repoRoot);
  const migrationsDir = getMigrationsDir(repoRoot);

  const status = {
    initialized: fs.existsSync(dbDir),
    hasSchema: fs.existsSync(tablesPath),
    tables: 0,
    enums: 0,
    migrations: 0,
    dialect: null
  };

  if (status.hasSchema) {
    const schema = loadTablesJson(repoRoot);
    if (schema) {
      status.tables = (schema.tables || []).length;
      status.enums = (schema.enums || []).length;
      status.dialect = schema.database?.dialect || null;
    }
  }

  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    status.migrations = files.length;
  }

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('DB Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Has schema: ${status.hasSchema ? 'yes' : 'no'}`);
  console.log(`  Tables: ${status.tables}`);
  console.log(`  Enums: ${status.enums}`);
  console.log(`  Migrations: ${status.migrations}`);
  console.log(`  Dialect: ${status.dialect || '(unknown)'}`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
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
    case 'import-prisma':
      cmdImportPrisma(repoRoot, opts['prisma-path'], !!opts['dry-run']);
      break;
    case 'generate-migration':
      cmdGenerateMigration(repoRoot, opts['name']);
      break;
    case 'verify':
      cmdVerify(repoRoot, !!opts['strict']);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
