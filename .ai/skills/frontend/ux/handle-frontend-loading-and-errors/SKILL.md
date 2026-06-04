---
name: handle-frontend-loading-and-errors
description: Implement resilient loading/empty/error/permission/retry UX states for async interfaces with user-safe messaging and recoverable flows. Primary intent: failure-state UX quality; pairs with component, data-fetching, and UI-guideline skills when needed.
---

# Handle Frontend Loading and Errors

## Purpose
Ensure every user-facing screen behaves predictably under slow networks, missing data, and errors.

## When to use
Use this skill when you are:
- Building a new page or data-driven component
- Introducing Suspense or async data fetching
- Handling API failures or permission failures in UI
- Standardizing error messages and retry actions

## Inputs
- UX expectations (what to show while loading, what error messaging is acceptable)
- Data fetching mechanism (explicit loading state vs Suspense)
- Error contract (status codes, error codes, message policy)

## Outputs
- Loading UI components (skeleton/spinner) consistent across the app
- Error boundaries or explicit error rendering
- Empty state rendering (no data) with next actions
- Retry strategy (refetch/retry button)

## Rules
- UI MUST explicitly handle:
  - loading
  - empty/no data
  - error
- Error messages MUST be user-safe and SHOULD avoid leaking internal details.
- Retry SHOULD be available when it is likely to succeed (transient failures).
- Permission failures SHOULD be distinguished from generic errors when possible.

## Steps
1. Decide your data boundary:
   - explicit `isLoading/isError`
   - Suspense + error boundary
2. Implement a consistent loading component.
3. Implement error rendering:
   - user-safe message
   - optional diagnostics (support ID)
4. Implement empty state:
   - explanation
   - next action
5. Verify:
   - simulate slow network (loading visible)
   - simulate 404/no data (empty state)
   - simulate failure (error UI + retry)

## Verification

- [ ] Loading state is visible during data fetch (simulate slow network)
- [ ] Empty state renders when no data is available
- [ ] Error state renders with user-safe message on failure
- [ ] Retry action works for transient failures
- [ ] Permission errors are distinguished from generic errors
- [ ] Error messages do not leak internal details

## Boundaries

- MUST NOT skip loading state for async operations
- MUST NOT show raw error messages or stack traces to users
- MUST NOT leave UI in undefined state during fetch
- SHOULD NOT show retry for non-recoverable errors
- SHOULD NOT use identical messages for all error types
- SHOULD NOT block entire UI when a single component fails (use error boundaries)

## Included assets
- Templates: `./templates/` provides loading, empty, and error boundary scaffolds.
- Examples: `./examples/` provides UX state acceptance criteria.
