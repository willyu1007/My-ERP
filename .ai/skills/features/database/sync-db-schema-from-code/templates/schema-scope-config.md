# Schema Scope Configuration

## Purpose

Configure which PostgreSQL schemas to include/exclude during database synchronization, particularly when working with databases that have extensions (e.g., PostGIS, pg_trgm) installed.

## When to use

Use schema scope configuration when:
- The target database has PostgreSQL extensions installed
- Extensions create objects in non-public schemas (e.g., `tiger`, `topology`, `extensions`)
- Prisma migrate or db push fails due to extension-related schema conflicts
- You need to sync only specific schemas (not the entire database)

## Configuration options

### Option 1: Prisma `schemas` array (Recommended)

Configure in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public"]  // Only sync the public schema
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]  // Required for multi-schema support
}
```

### Option 2: Environment-based configuration

For dynamic configuration, use a wrapper script or `.env`:

```bash
# .env
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"

# Alternatively, for scripts
SYNC_INCLUDE_SCHEMAS="public"
SYNC_EXCLUDE_SCHEMAS="extensions,tiger,topology"
```

### Option 3: Script parameters

When using the schema snapshot script:

```bash
python3 ./scripts/db_schema_snapshot.py \
  --url "$DATABASE_URL" \
  --exclude-schemas extensions,tiger,topology \
  --out "<evidenceDir>/schema_snapshot.json"
```

## Common extension schemas to exclude

| Extension | Schemas to exclude | Notes |
|-----------|-------------------|-------|
| PostGIS | `tiger`, `tiger_data`, `topology` | Geocoding and topology support |
| pgRouting | `public` objects with `pgr_` prefix | Usually in public, filter by object name |
| pg_trgm | (none) | Installs in public, no separate schema |
| uuid-ossp | (none) | Installs in public, no separate schema |
| Custom extensions | Varies | Check with `\dx+` in psql |

## Detecting installed extensions

Run this query to detect extensions and their schemas:

```sql
SELECT 
  e.extname AS extension_name,
  n.nspname AS schema_name,
  e.extversion AS version
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname != 'plpgsql'
ORDER BY e.extname;
```

## Troubleshooting

### Error: "schema X does not exist"

**Cause**: Prisma is trying to access a schema that doesn't exist or is excluded.

**Solution**: Ensure all schemas referenced in your Prisma models are included in the `schemas` array.

### Error: "function/type X does not exist"

**Cause**: Extension objects are being referenced but the extension schema is excluded.

**Solution**: 
1. Keep the extension schema but exclude it from migrations
2. Or ensure the extension is installed before running migrations

### Error: "permission denied for schema"

**Cause**: Database user doesn't have access to extension schemas.

**Solution**: Either grant access or exclude the schema from sync scope.

## Verification checklist

- [ ] Identified all extensions installed on target database
- [ ] Documented schemas created by extensions
- [ ] Configured `schemas` array in `prisma/schema.prisma` (if using Prisma)
- [ ] Tested `prisma migrate diff` with schema scope configuration
- [ ] Verified application can still use extension functions after migration
