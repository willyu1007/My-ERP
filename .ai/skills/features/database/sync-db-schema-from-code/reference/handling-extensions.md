# Handling PostgreSQL Extensions

## Overview

PostgreSQL extensions can cause schema synchronization failures when:
1. Extensions create objects in schemas other than `public`
2. Extension objects (functions, types, operators) are detected as "drift"
3. Prisma shadow database cannot replicate extension setup

This guide covers strategies to handle these scenarios.

## Common failure scenarios

### Scenario 1: PostGIS extension schemas

**Symptom**: Prisma migrate fails with errors about `tiger`, `topology`, or `tiger_data` schemas.

**Cause**: PostGIS installs geocoding support in separate schemas.

**Solution**:

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public"]  // Exclude PostGIS schemas
}
```

### Scenario 2: Extension functions in public schema

**Symptom**: `prisma migrate diff` shows functions like `ST_Distance`, `uuid_generate_v4` as changes.

**Cause**: Extension functions exist in `public` schema but aren't in Prisma schema.

**Solution**:
1. These are expected - Prisma doesn't manage extension objects
2. Document in `01-schema-drift-report.md` as "extension objects (expected)"
3. Use `prisma migrate diff --from-schema-datamodel` to compare only model changes

### Scenario 3: Shadow database setup fails

**Symptom**: `prisma migrate dev` fails because shadow database can't install extensions.

**Cause**: Extensions require superuser or specific permissions.

**Solutions**:
1. Use `prisma migrate deploy` instead (no shadow database)
2. Pre-create extensions on shadow database
3. Use `db push` for development (no shadow database)

## Extension detection script

Run during Phase A preflight:

```sql
-- List all non-default extensions
SELECT 
  e.extname,
  n.nspname AS schema,
  e.extversion,
  CASE 
    WHEN n.nspname = 'public' THEN 'May affect public schema objects'
    ELSE 'Has separate schema - consider excluding'
  END AS recommendation
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname NOT IN ('plpgsql')
ORDER BY n.nspname, e.extname;
```

## Strategy by extension type

### PostGIS

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public"]
}
```

Exclude from snapshot:
```bash
--exclude-schemas tiger,tiger_data,topology
```

### uuid-ossp / pgcrypto

No schema exclusion needed. Document that `uuid_generate_v4()` or `gen_random_uuid()` are extension functions.

### pg_trgm / fuzzystrmatch

No schema exclusion needed. These add functions/operators to public schema.

### timescaledb

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "_timescaledb_internal"]  // May need internal schema
}
```

Or exclude:
```bash
--exclude-schemas _timescaledb_catalog,_timescaledb_internal,_timescaledb_cache,_timescaledb_config
```

## Migration workflow with extensions

### Recommended workflow

1. **Preflight**: Detect extensions (step 6 in main workflow)
2. **Configure**: Set up schema scope if needed
3. **Diff**: Run `prisma migrate diff` with scope
4. **Review**: Document extension objects as "expected drift"
5. **Apply**: Use `prisma migrate deploy` (not `dev`) for production
6. **Verify**: Confirm extension functions still work

### Commands

```bash
# Check current database extensions
psql $DATABASE_URL -c "SELECT extname, extnamespace::regnamespace FROM pg_extension;"

# Generate migration with schema scope
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script

# Deploy without shadow database
npx prisma migrate deploy
```

## Troubleshooting

### "could not open extension control file"

Extension is not installed on the target database. Install it first:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
```

### "permission denied to create extension"

User lacks privileges. Options:
1. Have DBA install extensions
2. Use a superuser for migrations
3. Request `CREATE` permission on database

### "type geography does not exist"

PostGIS not installed or not in search path. Add to connection:

```
?options=-c%20search_path=public,tiger
```

Or ensure extension is installed in `public` schema.

## Documentation template

Include this in `01-schema-drift-report.md`:

```markdown
## Extension Status

| Extension | Version | Schema | Impact on Sync |
|-----------|---------|--------|----------------|
| postgis | 3.3.2 | public | Functions in public (expected) |
| postgis_tiger_geocoder | 3.3.2 | tiger | Excluded from sync |
| postgis_topology | 3.3.2 | topology | Excluded from sync |

### Schema Scope Configuration

- Included schemas: `public`
- Excluded schemas: `tiger`, `topology`, `tiger_data`
- Prisma `schemas` array: `["public"]`

### Extension Objects (Expected Drift)

The following objects are created by extensions and will appear in diffs but should NOT be modified:
- Functions: `ST_*`, `geography_*`, `geometry_*`
- Types: `geometry`, `geography`, `box2d`, `box3d`
- Operators: Various geometric operators
```
