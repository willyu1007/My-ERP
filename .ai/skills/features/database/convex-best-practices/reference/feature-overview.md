# Convex Best Practices

## Purpose

This skill gives the agent a deterministic way to author and review Convex code so that:

- schema evolution happens in one place: `convex/schema.ts`
- runtime API shape remains visible under `docs/context/convex/functions.json`
- database shape remains visible under `docs/context/db/schema.json`
- generated types and runtime validators stay aligned

## Key invariants

- `convex/schema.ts` is the persistence SSOT in Convex mode.
- Public functions are validated at runtime.
- Public functions with privileged behavior perform explicit access control.
- Read paths are index-aware.
- Generated code is never hand-edited.
- Context contracts are refreshed after schema or function changes.

## Main outcome

A fresh agent should be able to read a small, stable set of files and act correctly without reconstructing the whole repository from scratch.
