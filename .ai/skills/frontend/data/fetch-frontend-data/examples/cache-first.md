# Example: Cache-first strategy (conceptual)

## Goal
Reduce network calls for data that rarely changes.

## Pattern
- Set a non-trivial `staleTime` so cached data is used.
- Invalidate cache only on relevant mutations.
- Optionally refetch in background to keep data fresh.

## Verification
- Navigate away and back; data should appear instantly from cache.
- Trigger mutation; affected queries should update.
