/**
 * Shared Postgres harness for integration tests (excluded from the package build
 * in tsconfig.json — uses import.meta; vitest transpiles it as ESM).
 *
 * Targets a local **superuser** Postgres that can CREATE DATABASE + CREATE ROLE
 * (trust/peer auth), separate from the app's docker pg. Default port 5432;
 * override with TEST_PG_PORT. Tests skip when no such Postgres is reachable
 * (`describe.skipIf(!PG_AVAILABLE)`).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrationDirs } from './apply-migrations';

export const PORT = Number(process.env.TEST_PG_PORT ?? 5432);
export const APP_ROLE = 'myerp_rls_app';
export const APP_PW = 'rls_app_pw';

export function pgAvailable(): boolean {
  try {
    execSync(`pg_isready -p ${PORT}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Resolved once at import so test files can `describe.skipIf(!PG_AVAILABLE)`. */
export const PG_AVAILABLE = pgAvailable();

export function psql(db: string, sql: string): void {
  execSync(`psql -p ${PORT} -d ${db} -v ON_ERROR_STOP=1 -q`, {
    input: sql,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

export function migrationSql(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../prisma/migrations/${name}/migration.sql`, import.meta.url)),
    'utf8',
  );
}

/**
 * Create the shared app login role if missing. Concurrency-safe: parallel test
 * files race to create the same global role, so a plain `IF NOT EXISTS … CREATE
 * ROLE` has a TOCTOU race — catch `duplicate_object` instead.
 */
export function ensureAppRole(): void {
  psql(
    'postgres',
    `DO $$ BEGIN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );
}

/** Drop + recreate a fresh test database, apply all migrations, ensure the app role. */
export function createTestDb(db: string): void {
  psql('postgres', `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  psql('postgres', `CREATE DATABASE ${db};`);
  for (const m of migrationDirs()) psql(db, migrationSql(m));
  ensureAppRole();
}

export function dropTestDb(db: string): void {
  psql('postgres', `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
}

/** Connection URL as the non-privileged app role (RLS is enforced for it). */
export function appDbUrl(db: string): string {
  return `postgresql://${APP_ROLE}:${APP_PW}@localhost:${PORT}/${db}?schema=public`;
}
