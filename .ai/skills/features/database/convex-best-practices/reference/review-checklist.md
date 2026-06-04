# Convex Review Checklist

Use this checklist after any non-trivial Convex change.

## Schema and SSOT

- [ ] If stored data shape changed, `convex/schema.ts` changed first.
- [ ] Added fields, relations, and indexes are represented in the schema.
- [ ] No persistent model change was hidden only inside function code.

## Function correctness

- [ ] Reads use `query` unless there is a justified exception.
- [ ] Writes use `mutation`.
- [ ] External I/O uses `action` or `httpAction`.
- [ ] Internal-only steps use internal functions where appropriate.

## Validation and auth

- [ ] Every public `query` / `mutation` / `action` has `args`.
- [ ] Every `httpAction` parses and validates request input explicitly.
- [ ] Stable return shapes have `returns`.
- [ ] Privileged functions read identity on the server.
- [ ] Authorization uses server-trusted data, not client-only claims.

## Performance and maintainability

- [ ] Queries that need scale use indexes.
- [ ] `.filter(...)` is not used where an index or in-memory filter would be clearer.
- [ ] Shared authorization or mapping logic is extracted into helper functions.

## Generated outputs

- [ ] `convex/_generated/**` was refreshed.
- [ ] `docs/context/db/schema.json` was refreshed.
- [ ] `docs/context/convex/functions.json` was refreshed.
- [ ] Generated artifacts were not hand-edited.

## Repository hygiene

- [ ] No secrets were written to tracked files.
- [ ] Comments and docs reflect the new behavior.
- [ ] The blast radius is clear from the diff.
