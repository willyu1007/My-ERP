# Example: Optimistic update (conceptual)

## Scenario
A user toggles a “favorite” state.

## Pattern
1. Update the cache immediately (optimistic).
2. Call mutation.
3. On success: keep cache and optionally refetch.
4. On error: rollback cache and show user-safe error feedback.

## Boundary
Optimistic updates SHOULD be used only when rollback is straightforward and user impact is acceptable.
