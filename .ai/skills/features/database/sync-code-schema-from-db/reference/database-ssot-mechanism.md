# Database SSOT Mechanism (real DB is authoritative)

## 0) Non-negotiables (read first)

- **SSOT** is the running database (not the repo).
- `prisma/schema.prisma` is a **derived artifact** produced via `prisma db pull`.
- `db/schema/tables.json` is a **derived mirror snapshot** (normalized-db-schema-v2).
- `docs/context/db/schema.json` is the **LLM contract** (generated; do not hand-edit).
- The business layer must not import Prisma.

## 1) Canonical paths

- DB SSOT config: `docs/project/db-ssot.json`
- Prisma schema mirror: `prisma/schema.prisma`
- Repo mirror snapshot: `db/schema/tables.json`
- LLM DB contract: `docs/context/db/schema.json`
- Proposals/plans: `db/handbook/`

## 2) End-to-end workflow

### 2.1 Propose a schema change (desired state)

1. Write a short proposal in `db/handbook/`:
   - intended DDL change
   - risk assessment
   - rollout + verification checklist

2. Ask a human to apply the change to the target DB using the org’s process.

### 2.2 Mirror the new DB state back into the repo (current state)

3. Human runs introspection:

> Tooling note: `prisma db pull` uses Prisma engines and may fail on unsupported Node versions. Use **Node LTS (20 or 22)** (see `.nvmrc`).


- `npx prisma db pull`

4. Import the Prisma schema into the repo mirror:

- `node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma`

5. Refresh LLM context contract:

- `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

## 3) Three-layer object model (same as repo-prisma mode)

- Persistence model (Prisma) describes persisted fields, but is derived.
- Domain entities are business objects and can have computed/transient fields.
- DTO/interface models are boundary shapes.

Repositories remain the boundary and must return domain entities.

## 4) LLM routing

- To read DB shape: open `docs/context/db/schema.json`.
- To update mirrors after DB change: use skill `sync-code-schema-from-db`.
- To change persisted fields: create `db/handbook/` proposals; do not edit `schema.prisma` as SSOT.

## 5) Checklist

- [ ] `docs/project/db-ssot.json` mode is `database`
- [ ] `prisma db pull` ran against the intended environment
- [ ] `ctl-db import-prisma` updated `db/schema/tables.json`
- [ ] `ctl-db-ssot sync-to-context` updated `docs/context/db/schema.json`
- [ ] Business layer remains Prisma-free
