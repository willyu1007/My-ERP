---
name: execute-code-refactor
description: Execute dependency-aware code refactors (moves, extraction, import rewrites) incrementally with approval gates, rollback points, and continuous verification.
---

# Execute Code Refactor

## Purpose
Perform non-trivial refactors without breaking builds by planning dependency changes, applying incremental edits, and verifying continuously.

## When to use
Use the execute-code-refactor skill when:
- Reorganizing file/folder structures
- Breaking large modules/components into smaller units
- Updating imports after moves
- Standardizing repeated patterns across the codebase

Avoid using the skill when:
- You only need a refactor plan (use a planning workflow)
- The task is primarily behavior changes rather than structural refactor

## Inputs
- Refactor goal and success criteria (what should improve)
- Scope (which modules/features are in scope)
- Constraints (minimal diff, no behavior change, deadlines)
- Verification tools available (typecheck/build, tests, lint)

## Outputs
- An approved refactor plan with ordered steps and rollback points
- A dependency map for files being moved/renamed
- A sequence of changes that keeps the codebase buildable
- Verification evidence (what was run and passed at checkpoints)

## Core rules
- Before moving/renaming, you MUST identify all import sites.
- Refactors MUST be incremental; keep the codebase buildable after each checkpoint.
- Behavior-changing edits MUST be separated from structural refactors when possible.
- High-impact moves/renames MUST be approved before execution.

## Steps

### 1) Define the objective and constraints
- Write the goal and non-goals.
- Define the acceptable risk level and the maximum scope.

### 2) Inventory dependencies (required)
- Use the dependency map template to capture:
  - incoming imports (who depends on the module)
  - outgoing imports (what the module depends on)
  - exported symbols and any barrel exports

### 3) Draft an execution plan (required)
- Break work into small steps that keep the codebase green.
- Add explicit rollback points (last known-green commit or checkpoint).

### 4) Approval checkpoint (required for high-impact refactors)
Before any of the following, obtain explicit approval:
- moving/renaming files used broadly
- changing public exports
- restructuring shared libraries

At approval time, provide:
- plan summary
- expected risks
- verification commands

### 5) Execute incrementally with checkpoints
For each step:
1. Apply the smallest change (move one file, extract one component, etc.).
2. Update imports and exports.
3. Run verification (typecheck/build; tests when applicable).
4. Record the checkpoint as “green” before proceeding.

### 6) Final verification and cleanup
- Run the full verification suite available (build/typecheck + tests + lint).
- Remove dead code and unused exports introduced by the refactor.

## Verification
- [ ] Dependency map exists for moved/renamed modules
- [ ] Build/typecheck passes after each checkpoint
- [ ] All import sites are updated after moves/renames
- [ ] No circular dependencies introduced
- [ ] Tests pass after completion (where available)
- [ ] Approval gate respected for high-impact moves

## Boundaries
- MUST NOT move files without updating all import sites
- MUST NOT mix behavior changes with structural refactors
- MUST NOT skip verification after each checkpoint
- MUST NOT introduce circular dependencies
- SHOULD NOT refactor large scopes in a single change (split into increments)
- SHOULD keep a rollback point available throughout execution

## Included assets
- Templates:
  - `./templates/refactor-checklist.md`
  - `./templates/dependency-map.md`
- Examples: `./examples/` includes a large component extraction playbook.
