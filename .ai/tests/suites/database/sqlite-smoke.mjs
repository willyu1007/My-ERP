/**
 * sqlite-smoke.mjs
 * SQLite smoke test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython } from '../../lib/python.mjs';
import { assertIncludes } from '../../lib/text.mjs';

export const name = 'database-sqlite-smoke';

function sqliteUrlFromPath(filePath) {
  const abs = path.resolve(filePath);
  const posix = abs.split(path.sep).join('/');
  return `sqlite:///${posix}`;
}

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  fs.mkdirSync(testDir, { recursive: true });

  const dbPath = path.join(testDir, 'test.db');
  const mkDb = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      '-c',
      [
        'import sqlite3, sys',
        'db_path = sys.argv[1]',
        'conn = sqlite3.connect(db_path)',
        'cur = conn.cursor()',
        'cur.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT)")',
        'cur.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT, FOREIGN KEY(user_id) REFERENCES users(id))")',
        'conn.commit()',
        'conn.close()',
        'print(db_path)',
      ].join('\n'),
      dbPath,
    ],
    evidenceDir: testDir,
    label: `${name}.mkdb`,
  });
  if (mkDb.error || mkDb.code !== 0) {
    const detail = mkDb.error ? String(mkDb.error) : mkDb.stderr || mkDb.stdout;
    return { name, status: 'FAIL', error: `failed to create sqlite db: ${detail}` };
  }

  const dbUrl = sqliteUrlFromPath(dbPath);

  const scriptsDir = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'database',
    'sync-db-schema-from-code',
    'scripts'
  );

  const connectOut = path.join(testDir, 'connection.md');
  const connect = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      path.join(scriptsDir, 'db_connect_check.py'),
      '--url',
      dbUrl,
      '--out',
      connectOut,
    ],
    evidenceDir: testDir,
    label: `${name}.connect`,
  });
  if (connect.error || connect.code !== 0) {
    const detail = connect.error ? String(connect.error) : connect.stderr || connect.stdout;
    return { name, status: 'FAIL', error: `db_connect_check failed: ${detail}` };
  }
  assertIncludes(fs.readFileSync(connectOut, 'utf8'), 'Status: **PASS**', 'Expected PASS in connection.md');

  const snapshotOut = path.join(testDir, 'snapshot.json');
  const snapshot = runCommand({
    cmd: python.cmd,
    args: [
      ...python.argsPrefix,
      '-B',
      path.join(scriptsDir, 'db_schema_snapshot.py'),
      '--url',
      dbUrl,
      '--out',
      snapshotOut,
      '--include-sql',
    ],
    evidenceDir: testDir,
    label: `${name}.snapshot`,
  });
  if (snapshot.error || snapshot.code !== 0) {
    const detail = snapshot.error ? String(snapshot.error) : snapshot.stderr || snapshot.stdout;
    return { name, status: 'FAIL', error: `db_schema_snapshot failed: ${detail}` };
  }

  const snap = JSON.parse(fs.readFileSync(snapshotOut, 'utf8'));
  const tables = snap && snap.tables ? Object.keys(snap.tables) : [];
  if (!tables.includes('users')) return { name, status: 'FAIL', error: "Expected 'users' table in snapshot.json" };
  if (!tables.includes('posts')) return { name, status: 'FAIL', error: "Expected 'posts' table in snapshot.json" };

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
