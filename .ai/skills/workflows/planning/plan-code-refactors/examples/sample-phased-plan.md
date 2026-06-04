# Example: Phased refactor plan (component extraction)

## Goal
Split a 1,500-line UI component into smaller components without changing behavior.

## Non-goals
- No design changes
- No new features

## Phase 0: Preparation
- Verify baseline: run typecheck and tests; capture current snapshots.
- Identify invariants:
  - ...

## Phase 1: Structural changes
- Extract `Header`, `Filters`, `ResultsTable` into new files.
- Keep props identical; no behavior changes.
- After each extraction: run typecheck and relevant tests.

## Phase 2: Abstractions
- Introduce shared helpers for repeated formatting logic.
- Migrate call sites incrementally; keep old helpers until final cutover.

## Phase 3: Cleanup
- Remove dead code and unused exports.
- Update documentation/comments for any non-obvious decisions.

## Rollback points
- After each extracted component, codebase should build and tests should pass.
- If failures occur, revert to the last green checkpoint and re-attempt in smaller steps.

## Verification
- Typecheck/build clean
- Tests pass
- Manual smoke check: render common routes and confirm interactions
