# Example: Optimistic update (code-oriented, library-agnostic intent)

## Steps
1. Snapshot current cached value.
2. Update cached value immediately.
3. Perform mutation request.
4. On error: restore snapshot.
5. On success: keep cache and optionally refetch.

## Notes
- Only use optimistic updates when rollback is safe and predictable.
- Always show user feedback when the mutation ultimately fails.
