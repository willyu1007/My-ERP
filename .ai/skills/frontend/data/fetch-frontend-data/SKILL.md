---
name: fetch-frontend-data
description: Fetch and mutate frontend data with a consistent cache strategy (query keys, invalidation, suspense/loading, error handling, optimistic updates).
---

# Fetch Frontend Data

## Purpose
Standardize how the UI fetches and mutates server data so loading/error states, caching, and invalidation are predictable.

## When to use
Use this skill when you are:
- Adding a new API read or mutation
- Implementing server-state caching
- Introducing Suspense-based data loading (optional)
- Handling parallel data fetches and dependent queries
- Implementing optimistic updates

## Inputs
- API endpoints and request/response DTOs
- Caching requirements (stale time, refetch behavior)
- UX expectations for loading and errors
- Existing query/cache library (if any)

## Outputs
- Query key strategy and hooks
- Mutation strategy with invalidation
- Loading/error UX plan
- Example payloads and expected behavior

## Rules
- Server state SHOULD be managed via a query/cache layer (not duplicated in local state).
- Query keys MUST be stable and consistent across the codebase.
- Mutations MUST define how cache is updated (invalidate, update cache, optimistic).
- Error states MUST be explicit and user-safe.

## Steps
1. Define a typed API client function (one responsibility per function).
2. Define query keys and a query hook.
3. Define mutation hooks with:
   - invalidation strategy
   - optimistic update (optional)
4. Define loading and error UI state (or Suspense boundaries).
5. Verify with:
   - one successful fetch
   - one failure response
   - one mutation followed by refreshed UI state

## Verification

- [ ] Query keys are stable and follow project conventions
- [ ] Successful fetch renders expected data
- [ ] Failed fetch renders error UI with user-safe message
- [ ] Mutation invalidates or updates cache correctly
- [ ] Loading state is visible during fetch
- [ ] Optimistic update reverts on failure (if implemented)

## Boundaries

- MUST NOT duplicate server state in local state
- MUST NOT use inconsistent query key patterns
- MUST NOT skip error handling for mutations
- MUST NOT expose raw API errors to users
- SHOULD NOT refetch on every render (use appropriate stale time)
- SHOULD NOT implement optimistic updates without rollback logic

## Included assets
- Templates: `./templates/` includes query key patterns and hook scaffolds.
- Examples: `./examples/` includes cache-first, parallel fetch, and optimistic update patterns.
