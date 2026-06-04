---
name: resolve-typescript-build-errors
description: Resolve TypeScript compilation errors by grouping diagnostics, fixing root causes first, applying safe fix patterns, and verifying via a clean compile.
---

# Resolve TypeScript Build Errors

## Purpose
Fix TypeScript compilation errors efficiently by grouping diagnostics, addressing root causes first, and verifying with a clean compile.

## When to use
Use this skill when:
- `tsc` (or your build) fails with type errors
- A refactor introduced widespread type breakage
- You upgraded dependencies and type definitions changed
- CI fails on TypeScript checks

## Inputs
- The full TypeScript diagnostic output (copy/paste is fine)
- The command used to reproduce the errors (or the CI step)
- The scope of the change (which packages/modules were modified)
- Any constraints (do not refactor, minimal fix, etc.)

## Outputs
- A prioritized error list grouped by root cause
- Code changes that resolve the errors with minimal collateral changes
- Verification evidence: which command(s) now pass

## Core rules
- You MUST fix root causes before chasing downstream errors.
- You SHOULD avoid `@ts-ignore` and unsafe casts; if used, you MUST justify and isolate them.
- You MUST verify by re-running the TypeScript check until it is clean.

## Steps
1. **Collect diagnostics (complete, not partial)**
   - Capture the full error output (not just the first error).
   - Identify which build target is failing (app, server, library).
   - Record the reproduction command.

2. **Group errors by root cause**
   - missing exports/imports
   - signature/assignment incompatibilities
   - property/shape mismatches
   - `undefined`/`null` strictness
   - `unknown` flows
   - generic constraint failures
   - module resolution/tsconfig issues

3. **Prioritize the highest-leverage fixes**
   - Start with missing exports/paths (often unlocks many errors).
   - Then fix shared types/interfaces used widely.
   - Then fix local call sites.

4. **Apply minimal, safe fix patterns**
   - Use the triage worksheet to track groups and progress.
   - Use the common fix patterns reference for typical error categories.
   - After each group fix, re-run the reproduction command to confirm you are reducing errors.

5. **Verify to clean**
   - Re-run the same TypeScript check until it produces zero errors.
   - If changes touched runtime logic or boundaries, run the relevant tests.

## Verification
- [ ] TypeScript build completes with zero errors
- [ ] Root cause errors are fixed (not just downstream symptoms)
- [ ] No suppressions introduced without justification (`@ts-ignore`, `as any`)
- [ ] Reproduction command now passes consistently
- [ ] Tests pass after fixes (if applicable)

## Boundaries
- MUST NOT use `@ts-ignore` to silence errors (use `@ts-expect-error` only as a justified last resort)
- MUST NOT use `as any` to force compilation
- MUST NOT fix downstream errors before root causes
- MUST NOT refactor unrelated code while fixing type errors
- SHOULD NOT skip verification after each batch of fixes

## Included assets
- Templates:
  - `./templates/triage-worksheet.md`
  - `./templates/common-fix-patterns.md`
- Examples: `./examples/` includes a sample error-to-fix mapping.
