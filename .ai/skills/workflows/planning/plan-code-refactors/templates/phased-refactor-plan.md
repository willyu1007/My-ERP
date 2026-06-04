# Template: Phased refactor plan

## Phase 0: Preparation
- establish baseline tests/build
- identify invariants
- define success metrics

## Phase 1: Structural changes
- move/rename modules with minimal behavior change
- update imports
- keep build green

## Phase 2: Abstractions
- introduce new shared components/helpers
- migrate call sites gradually

## Phase 3: Cleanup
- remove deprecated paths
- simplify and document

## Verification per phase
- build/typecheck
- tests
- manual smoke checks (if needed)
