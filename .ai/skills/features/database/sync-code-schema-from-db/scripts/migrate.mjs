#!/usr/bin/env node
/**
 * migrate.mjs
 *
 * Migration execution helper for the DB Mirror feature.
 * Note: This script does NOT execute migrations automatically for safety.
 * It helps track and plan migrations; humans must execute them.
 *
 * Commands:
 *   list              List all migrations and their status
 *   status            Show migration status for an environment
 *   plan              Show what would be applied
 *   mark-applied      Mark a migration as applied (for tracking)
 *   mark-pending      Mark a migration as pending (for tracking)
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs <command> [options]

Commands:
  list
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List all migrations.

  status
    --env <string>              Environment (required)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show migration status for an environment.

  plan
    --env <string>              Environment (required)
    --repo-root <path>          Repo root (default: cwd)
    Show what migrations would be applied.

  mark-applied
    --migration <string>        Migration filename (required)
    --env <string>              Environment (required)
    --repo-root <path>          Repo root (default: cwd)
    Mark a migration as applied (for tracking).

  mark-pending
    --migration <string>        Migration filename (required)
    --env <string>              Environment (required)
    --repo-root <path>          Repo root (default: cwd)
    Mark a migration as pending (for tracking).

Examples:
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs list
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs status --env staging
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs plan --env prod
  node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs mark-applied --migration 20241228120000_add_users.sql --env staging

Note: This script does NOT execute migrations. Humans must run them manually.
The script helps track which migrations have been applied to each environment.
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

// ============================================================================
// Migration Management
// ============================================================================

function getDbDir(repoRoot) {
  return path.join(repoRoot, 'db');
}

function getMigrationsDir(repoRoot) {
  return path.join(getDbDir(repoRoot), 'migrations');
}

function getMigrationStatePath(repoRoot) {
  return path.join(getDbDir(repoRoot), 'config', 'migration-state.json');
}

function loadMigrationState(repoRoot) {
  const statePath = getMigrationStatePath(repoRoot);
  const data = readJson(statePath);
  if (!data) {
    return {
      version: 1,
      environments: {}
    };
  }
  return data;
}

function saveMigrationState(repoRoot, state) {
  writeJson(getMigrationStatePath(repoRoot), state);
}

function listMigrationFiles(repoRoot) {
  const migrationsDir = getMigrationsDir(repoRoot);
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir);
  return files
    .filter(f => f.endsWith('.sql'))
    .sort();
}

function getMigrationInfo(filename) {
  // Parse filename like: 20241228120000_add_users.sql
  const match = filename.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) {
    return {
      filename,
      timestamp: null,
      name: filename.replace('.sql', ''),
      valid: false
    };
  }

  return {
    filename,
    timestamp: match[1],
    name: match[2].replace(/-/g, ' '),
    valid: true
  };
}

// ============================================================================
// Commands
// ============================================================================

function cmdList(repoRoot, format) {
  const files = listMigrationFiles(repoRoot);
  const state = loadMigrationState(repoRoot);

  const migrations = files.map(f => {
    const info = getMigrationInfo(f);
    const envStatus = {};
    
    for (const [env, envState] of Object.entries(state.environments || {})) {
      envStatus[env] = envState.applied?.includes(f) ? 'applied' : 'pending';
    }

    return {
      ...info,
      environments: envStatus
    };
  });

  if (format === 'json') {
    console.log(JSON.stringify({ migrations }, null, 2));
    return;
  }

  console.log(`Migrations (${migrations.length} total):\n`);

  if (migrations.length === 0) {
    console.log('  (no migrations found)');
    console.log('  Run: node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs generate-migration --name <name>');
    return;
  }

  for (const m of migrations) {
    const validity = m.valid ? '' : ' [invalid filename]';
    console.log(`  ${m.filename}${validity}`);
    if (Object.keys(m.environments).length > 0) {
      for (const [env, status] of Object.entries(m.environments)) {
        const icon = status === 'applied' ? '✓' : '○';
        console.log(`    ${icon} ${env}: ${status}`);
      }
    }
  }
}

function cmdStatus(repoRoot, env, format) {
  if (!env) die('[error] --env is required');

  const files = listMigrationFiles(repoRoot);
  const state = loadMigrationState(repoRoot);
  const envState = state.environments?.[env] || { applied: [] };

  const applied = files.filter(f => envState.applied?.includes(f));
  const pending = files.filter(f => !envState.applied?.includes(f));

  const status = {
    environment: env,
    total: files.length,
    applied: applied.length,
    pending: pending.length,
    appliedMigrations: applied,
    pendingMigrations: pending
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`Migration Status for "${env}":\n`);
  console.log(`  Total:   ${status.total}`);
  console.log(`  Applied: ${status.applied}`);
  console.log(`  Pending: ${status.pending}`);
  console.log('');

  if (pending.length > 0) {
    console.log('  Pending migrations:');
    for (const m of pending) {
      console.log(`    ○ ${m}`);
    }
  } else {
    console.log('  All migrations applied.');
  }
}

function cmdPlan(repoRoot, env) {
  if (!env) die('[error] --env is required');

  const files = listMigrationFiles(repoRoot);
  const state = loadMigrationState(repoRoot);
  const envState = state.environments?.[env] || { applied: [] };

  const pending = files.filter(f => !envState.applied?.includes(f));

  console.log(`Migration Plan for "${env}":\n`);

  if (pending.length === 0) {
    console.log('  No pending migrations.');
    return;
  }

  console.log('  The following migrations would be applied:\n');
  for (let i = 0; i < pending.length; i++) {
    console.log(`  ${i + 1}. ${pending[i]}`);
  }

  console.log('\n  Instructions:');
  console.log('  1. Review each migration file carefully');
  console.log('  2. Backup your database before applying');
  console.log('  3. Apply migrations in order using your preferred tool');
  console.log('  4. Run: node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs mark-applied --migration <file> --env ' + env);
}

function cmdMarkApplied(repoRoot, migration, env) {
  if (!migration) die('[error] --migration is required');
  if (!env) die('[error] --env is required');

  const files = listMigrationFiles(repoRoot);
  if (!files.includes(migration)) {
    die(`[error] Migration file not found: ${migration}`);
  }

  const state = loadMigrationState(repoRoot);
  if (!state.environments[env]) {
    state.environments[env] = { applied: [] };
  }

  if (state.environments[env].applied.includes(migration)) {
    console.log(`[info] Migration already marked as applied: ${migration}`);
    return;
  }

  state.environments[env].applied.push(migration);
  state.environments[env].applied.sort();
  state.environments[env].lastUpdated = new Date().toISOString();

  saveMigrationState(repoRoot, state);
  console.log(`[ok] Marked as applied: ${migration} (${env})`);
}

function cmdMarkPending(repoRoot, migration, env) {
  if (!migration) die('[error] --migration is required');
  if (!env) die('[error] --env is required');

  const state = loadMigrationState(repoRoot);
  if (!state.environments[env]) {
    console.log(`[info] No state found for environment: ${env}`);
    return;
  }

  const index = state.environments[env].applied?.indexOf(migration);
  if (index === -1 || index === undefined) {
    console.log(`[info] Migration not in applied list: ${migration}`);
    return;
  }

  state.environments[env].applied.splice(index, 1);
  state.environments[env].lastUpdated = new Date().toISOString();

  saveMigrationState(repoRoot, state);
  console.log(`[ok] Marked as pending: ${migration} (${env})`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();

  switch (command) {
    case 'list':
      cmdList(repoRoot, format);
      break;
    case 'status':
      cmdStatus(repoRoot, opts['env'], format);
      break;
    case 'plan':
      cmdPlan(repoRoot, opts['env']);
      break;
    case 'mark-applied':
      cmdMarkApplied(repoRoot, opts['migration'], opts['env']);
      break;
    case 'mark-pending':
      cmdMarkPending(repoRoot, opts['migration'], opts['env']);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
