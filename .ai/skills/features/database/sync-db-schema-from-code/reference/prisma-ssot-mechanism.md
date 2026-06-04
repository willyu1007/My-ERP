# Prisma SSOT Mechanism (schema.prisma is authoritative)

## 0) Non-negotiables (read first)

- **SSOT**: `prisma/schema.prisma` is the only authoritative schema definition.
- **DB changes** happen via Prisma migrations (`prisma migrate`).
- **The business layer must not import Prisma** (no Prisma types, no client usage).
- Repositories are the boundary: they adapt **Prisma ↔ persistence ↔ domain**.
- `docs/context/db/schema.json` is the **LLM-readable contract** and is **generated**.
  - Update via: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
- Two opposing SSOT modes are mutually exclusive:
  - `repo-prisma` (this doc)
  - `database` (see the DB SSOT docs)

If the repo is configured as DB-as-SSOT (`docs/project/db-ssot.json`), STOP and use the DB SSOT workflow.

## 1) Canonical paths

- Prisma SSOT:
  - `prisma/schema.prisma`
- Prisma migration history:
  - `prisma/migrations/*/migration.sql`
- LLM DB contract:
  - `docs/context/db/schema.json` (generated)
- DB SSOT mode config:
  - `docs/project/db-ssot.json`

## 2) Three-layer object model

Use **three separate representations** of the same concept, each with strict responsibilities.

### 2.1 Persistence model (Prisma)

- Lives in `prisma/schema.prisma`.
- Defines *persisted fields only* (columns, relations, indexes).
- Avoid embedding business logic concerns here.

### 2.2 Domain entity (business object)

- The domain entity is what the business logic functions operate on.
- Commonly implemented as a class/struct (language-dependent).
- Must be Prisma-free.

Allowed:
- Invariants (validation), domain methods, business rules.
- Non-persisted fields (see section 3).

### 2.3 Interface / DTO model

- Shapes used at system boundaries:
  - API request/response DTOs
  - Events
  - serialization
- Often differs from domain model (flattening, field renames, omitting internal fields).

## 3) Can domain classes contain fields not in Prisma?

Yes, with strict rules.

### 3.1 Allowed categories

- **Computed/derived fields**
  - e.g., `displayName` derived from `firstName` + `lastName`
- **Transient workflow fields**
  - e.g., `isNew` / `validationErrors` / `uiHints`
- **Aggregations** (from other entities)
  - e.g., `roles: Role[]` when roles are loaded from a join table

### 3.2 Rules

- Non-Prisma fields MUST be **derived** from:
  - persisted fields, or
  - explicitly loaded related data, or
  - explicit runtime context (request-scoped)
- Repositories MUST make population explicit:
  - either compute inside repository mapping
  - or compute in a dedicated domain factory/assembler
- Never assume these fields are stored in DB.

## 4) End-to-end change workflow

### 4.1 When the requirement changes persisted data

> Tooling note: Prisma CLI/engines are sensitive to Node versions. For reliable migrations, use **Node LTS (20 or 22)**. If you are on Node 24+ and see engine errors, switch to the repo's recommended Node version (see `.nvmrc`).


1. Update `prisma/schema.prisma` (SSOT).
2. Generate a reviewable migration:
   - `npx prisma migrate dev --create-only --name <slug>`
3. Review migration SQL (especially destructive changes).
4. Update repository mapping and domain entities.
5. Apply migrations (env-dependent):
   - dev: `npx prisma migrate dev`
   - staging/prod: `npx prisma migrate deploy`
6. Refresh LLM contract:
   - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

### 4.2 When the requirement changes only business logic

- Do NOT touch `schema.prisma`.
- Update domain entity / DTO only.
- Keep repositories unchanged unless the mapping changes.

## 5) Repository boundary rules

### 5.1 Mandatory boundary

- Business layer imports:
  - domain entities
  - repository interfaces
- Infrastructure layer imports:
  - Prisma client
  - Prisma-generated types

### 5.2 Typical directory layout (example)

This is a suggestion; adapt to your stack.

- `src/domain/` (domain entities, domain services)
- `src/application/` (use-cases)
- `src/interfaces/` (DTOs, controllers/handlers)
- `src/infrastructure/db/prisma/` (Prisma client + repository implementations)

Key: Prisma stays under `infrastructure/`.

## 6) LLM operating procedure

- To understand DB shape: read `docs/context/db/schema.json`.
- To change persisted fields: use skill `sync-db-schema-from-code`.
- To add computed fields: update the domain entity (no Prisma).

## 7) Checklist

- [ ] `docs/project/db-ssot.json` mode is `repo-prisma`
- [ ] `schema.prisma` updated (persisted data only)
- [ ] Migration generated and reviewed
- [ ] Repository mapping updated
- [ ] Business layer is Prisma-free
- [ ] `docs/context/db/schema.json` refreshed via `ctl-db-ssot`
