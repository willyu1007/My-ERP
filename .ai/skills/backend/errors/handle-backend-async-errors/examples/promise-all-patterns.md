# Example: Parallel async operations

## When to use `Promise.all`
Use `Promise.all` when *all* operations must succeed.

- If one fails, the entire operation should fail.
- Failure should be mapped to a clear error response or a logged failure.

## When to use `Promise.allSettled`
Use `Promise.allSettled` when partial results are acceptable.

- Collect successful results.
- Log/track failures with operation-specific context.
