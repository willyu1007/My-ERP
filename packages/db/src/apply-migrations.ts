// Test-only helper (integration tests). Excluded from the package build in
// tsconfig.json because it uses import.meta (the package compiles to CommonJS);
// vitest transpiles it as ESM when the .test.ts files import it.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * All Prisma migration directory names in apply order — for integration-test
 * setup. Applying the full set keeps test DBs in sync with the current schema/
 * generated client (a later migration may alter a table an earlier test uses).
 */
export function migrationDirs(): string[] {
  const root = fileURLToPath(new URL('../../../prisma/migrations', import.meta.url));
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
