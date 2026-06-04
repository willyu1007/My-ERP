# Template: TypeScript error triage worksheet

## Environment
- Command:
- Package/module:
- Branch/commit:

## Error groups
1. Missing import/export
2. Type incompatibility
3. Property/shape mismatch
4. Narrowing issues (`unknown`)
5. Generics issues

## Plan
- Fix group 1 first (often unlocks others)
- Fix shared types/interfaces next
- Fix local call sites last

## Verification
- Final `tsc` output is clean
- Optional: tests pass
