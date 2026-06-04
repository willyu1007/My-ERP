/**
 * environment-fixture.mjs
 * Shared environment smoke-test fixture helpers.
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from './exec.mjs';
import { pickPython } from './python.mjs';

export function sqliteUrlFromPath(filePath) {
  const abs = path.resolve(filePath);
  const posix = abs.split(path.sep).join('/');
  return `sqlite:///${posix}`;
}

export function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function environmentScriptPaths(repoRoot) {
  return {
    contractctl: path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'environment',
      'env-contractctl',
      'scripts',
      'env_contractctl.py'
    ),
    localctl: path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'environment',
      'env-localctl',
      'scripts',
      'env_localctl.py'
    ),
    cloudctl: path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'environment',
      'env-cloudctl',
      'scripts',
      'env_cloudctl.py'
    ),
  };
}

function expectOk(result, label) {
  if (result.error || result.code !== 0) {
    const detail = result.error ? String(result.error) : result.stderr || result.stdout;
    throw new Error(`${label} failed: ${detail}`);
  }
}

function writeEnvironmentContract(rootDir, envs) {
  const enumValues = envs.join(', ');
  fs.writeFileSync(
    path.join(rootDir, 'env', 'contract.yaml'),
    `version: 1\n` +
      `variables:\n` +
      `  APP_ENV:\n` +
      `    type: enum\n` +
      `    enum: [${enumValues}]\n` +
      `    required: true\n` +
      `    default: dev\n` +
      `    description: Deployment environment profile.\n` +
      `  SERVICE_NAME:\n` +
      `    type: string\n` +
      `    required: true\n` +
      `    default: demo-service\n` +
      `    description: Service name.\n` +
      `  PORT:\n` +
      `    type: int\n` +
      `    required: true\n` +
      `    default: 8000\n` +
      `    description: HTTP port.\n` +
      `  API_BASE_URL:\n` +
      `    type: url\n` +
      `    required: true\n` +
      `    default: "https://api.example.com"\n` +
      `    description: Base URL for external API.\n` +
      `  DATABASE_URL:\n` +
      `    type: url\n` +
      `    required: true\n` +
      `    secret: true\n` +
      `    secret_ref: db_url\n` +
      `    description: Database connection URL.\n` +
      `  API_KEY:\n` +
      `    type: string\n` +
      `    required: true\n` +
      `    secret: true\n` +
      `    secret_ref: api_key\n` +
      `    description: API key for external service.\n`,
    'utf8'
  );
}

function writeEnvironmentValues(rootDir, envs) {
  for (const envName of envs) {
    fs.writeFileSync(
      path.join(rootDir, 'env', 'values', `${envName}.yaml`),
      `SERVICE_NAME: demo-service\nPORT: 8000\nAPI_BASE_URL: "https://api.example.com"\n`,
      'utf8'
    );
  }
}

function writeEnvironmentSecretRefs(rootDir, envs) {
  for (const envName of envs) {
    fs.writeFileSync(
      path.join(rootDir, 'env', 'secrets', `${envName}.ref.yaml`),
      `version: 1\n` +
        `secrets:\n` +
        `  db_url:\n` +
        `    backend: mock\n` +
        `    ref: "mock://${envName}/db_url"\n` +
        `  api_key:\n` +
        `    backend: mock\n` +
        `    ref: "mock://${envName}/api_key"\n`,
      'utf8'
    );
  }
}

function writeMockSecretStore(rootDir, envs, dbUrl) {
  for (const envName of envs) {
    fs.mkdirSync(path.join(rootDir, 'env', '.secrets-store', envName), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'env', '.secrets-store', envName, 'db_url'), dbUrl + '\n', 'utf8');
    fs.writeFileSync(
      path.join(rootDir, 'env', '.secrets-store', envName, 'api_key'),
      `${envName}-secret\n`,
      'utf8'
    );
  }
}

function createEnvironmentFixtureInternal(ctx, name, options = {}) {
  const {
    envs = ['dev'],
    includeCloudLifecycle = false,
  } = options;
  const python = pickPython();
  if (!python) {
    return { skip: true, reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  const rootDir = path.join(testDir, 'fixture');
  fs.mkdirSync(rootDir, { recursive: true });

  const scripts = environmentScriptPaths(ctx.repoRoot);

  const initMd = path.join(rootDir, 'init.md');
  const init = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.contractctl, 'init', '--root', rootDir, '--envs', envs.join(','), '--out', initMd],
    evidenceDir: testDir,
    label: `${name}.contractctl.init`,
  });
  expectOk(init, 'env-contractctl init');

  if (!fs.existsSync(path.join(rootDir, 'docs', 'project', 'env-ssot.json'))) {
    throw new Error('init did not create docs/project/env-ssot.json');
  }
  if (!fs.existsSync(path.join(rootDir, 'env', 'contract.yaml'))) {
    throw new Error('init did not create env/contract.yaml');
  }

  writeEnvironmentContract(rootDir, envs);
  writeEnvironmentValues(rootDir, envs);
  writeEnvironmentSecretRefs(rootDir, envs);

  if (includeCloudLifecycle) {
    fs.writeFileSync(
      path.join(rootDir, 'env', 'inventory', 'staging.yaml'),
      `version: 1\nenv: staging\nprovider: mockcloud\nruntime: mock\nregion: local\n`,
      'utf8'
    );
  }

  const dbPath = path.join(rootDir, '.tmp_sqlite.db');
  const mkDb = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      '-S',
      '-c',
      [
        'import sqlite3, sys',
        'p = sys.argv[1]',
        'conn = sqlite3.connect(p)',
        'conn.execute("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)")',
        'conn.commit()',
        'conn.close()',
        'print(p)',
      ].join('\n'),
      dbPath,
    ],
    evidenceDir: testDir,
    label: `${name}.mkdb`,
  });
  expectOk(mkDb, 'sqlite fixture setup');

  const dbUrl = sqliteUrlFromPath(dbPath);
  writeMockSecretStore(rootDir, envs, dbUrl);

  const paths = {
    initMd,
    dbPath,
    envExample: path.join(rootDir, 'env', '.env.example'),
    envDoc: path.join(rootDir, 'docs', 'env.md'),
    envContractJson: path.join(rootDir, 'docs', 'context', 'env', 'contract.json'),
    envLocal: path.join(rootDir, '.env.local'),
    effectiveDev: path.join(rootDir, 'docs', 'context', 'env', 'effective-dev.json'),
  };

  if (includeCloudLifecycle) {
    paths.stagingState = path.join(rootDir, '.ai', 'mock-cloud', 'staging', 'state.json');
    paths.stagingMockCloudDir = path.join(rootDir, '.ai', 'mock-cloud', 'staging');
  }

  return {
    skip: false,
    python,
    testDir,
    rootDir,
    scripts,
    paths,
  };
}

export function createPublicEnvironmentFixture(ctx, name) {
  return createEnvironmentFixtureInternal(ctx, name, {
    envs: ['dev'],
    includeCloudLifecycle: false,
  });
}

export function createMaintainerEnvironmentFixture(ctx, name) {
  return createEnvironmentFixtureInternal(ctx, name, {
    envs: ['dev', 'staging'],
    includeCloudLifecycle: true,
  });
}
