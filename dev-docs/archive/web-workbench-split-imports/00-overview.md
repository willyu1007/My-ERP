# 00 - Overview: Web workbench split imports

## Problem statement
The web workbench UI package exposes most components through a broad root barrel. My-ERP consumes that barrel
through `@my-erp/ui`, so simple finance routes can pull unrelated settings, hub, queue, record, and shell code into
their route chunks. This makes first-time route switching feel stalled before content can render.

## Status
- State: done
- Created: 2026-06-26
- Closed: 2026-06-26
- Task id: T-011
- Scope owner: frontend only; no DB, API, finance workflow, or authorization changes.

## Goal
Consume `@willyu1007/web-workbench` through stable grouped subpath exports and mirror those groups in `@my-erp/ui`.
After migration, app source should not import workbench components from the `@my-erp/ui` root entry.

## Non-goals
- Optimizing live API latency, query caching, or finance business state machines.
- Reworking sidebar IA, role workflows, ledger behavior, payments, or settings semantics.
- Importing unpublished `dist/components/*` internals.

## Acceptance criteria
- Template package publishes or locally verifies additive public entries: `primitives`, `shell`, `feedback`, `list`,
  `insight`, `settings`, `hub`, `queue`, `record`.
- My-ERP upgrades the dependency target to `@willyu1007/web-workbench@^0.6.6`.
- `@my-erp/ui` exposes matching grouped entries and keeps the root entry only as a compatibility surface.
- `apps/web` no longer imports workbench components or types from `@my-erp/ui`.
- Workbench route transitions show an immediate lightweight loading fallback while a first route chunk loads.
- Verification records package checks, My-ERP static checks, bundle inspection, and release status.
