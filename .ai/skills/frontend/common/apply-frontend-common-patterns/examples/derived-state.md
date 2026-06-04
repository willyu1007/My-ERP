# Example: Derived state vs duplicated state

## Problem
A component stores both `items` and `filteredItems` in state, and they get out of sync.

## Pattern
- Keep `items` as the source of truth.
- Compute `filteredItems` as a derived value:
  - via `useMemo` if the computation is expensive
  - inline if it is cheap

## Acceptance criteria
- No duplicated state for values that can be derived.
- Filtering logic is deterministic and tested if complex.
