# Example: Parallel data fetching (conceptual)

## Scenario
A page needs `user`, `settings`, and `permissions`.

## Pattern
- Use parallel queries when data is independent.
- Use dependent queries when one requires another’s output.
- Prefer a single composed API endpoint only when it reduces complexity and latency meaningfully.

## Verification
- No duplicate requests on re-render.
- Error handling is clear for partial failures (if tolerated).
