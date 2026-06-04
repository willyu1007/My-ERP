---
name: organize-frontend-codebase
description: Organize a frontend codebase by feature/module with clear public exports, predictable naming, and minimal cross-feature coupling.
---

# Organize Frontend Codebase

## Purpose
Create a frontend project structure that scales with features while keeping imports and responsibilities clear.

## When to use
Use this skill when you are:
- Creating a new feature module
- Refactoring messy or inconsistent folder structures
- Standardizing naming conventions and public exports
- Reducing import complexity and circular dependencies

## Inputs
- Current codebase structure and pain points
- Feature boundaries (what is shared vs feature-local)
- Existing tooling constraints (module aliasing, lint rules)

## Outputs
- A directory layout proposal and migration plan
- Naming conventions for files and exports
- A “public API” pattern for features

## Rules
- Features SHOULD be self-contained and expose a small public surface.
- Shared components SHOULD be truly reusable; avoid dumping ground “common” folders.
- Imports SHOULD prefer feature public exports over deep internal paths.

## Steps
1. Identify feature boundaries and shared dependencies.
2. Choose a structure (feature-first is recommended for large apps).
3. Define a feature public API (`index.ts` or equivalent).
4. Move files incrementally:
   - update imports
   - prevent circular deps
5. Verify:
   - build passes
   - routes/components still resolve
   - no broken exports

## Verification

- [ ] Build passes after reorganization
- [ ] All routes and components resolve correctly
- [ ] No circular dependencies introduced
- [ ] Feature public exports work as expected
- [ ] Imports use public APIs, not deep internal paths
- [ ] Lint rules pass (if import rules are enforced)

## Boundaries

- MUST NOT create circular dependencies between features
- MUST NOT import from deep internal paths across feature boundaries
- MUST NOT dump unrelated utilities into a "common" folder
- SHOULD NOT expose internal implementation details in feature public API
- SHOULD NOT change file structure without updating imports
- SHOULD NOT skip incremental migration (avoid big-bang refactors)

## Included assets
- Examples: `./examples/` includes a feature module structure blueprint.
