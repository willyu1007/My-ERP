---
name: build-backend-middleware
description: Design and implement backend middleware (auth, validation, logging, rate limits, error boundaries) with predictable ordering and behavior.
---

# Build Backend Middleware

## Purpose
Provide a structured approach to implementing middleware so cross-cutting concerns (auth, logging, validation, rate limits, error handling) are consistent and composable.

## When to use
Use this skill when you are:
- Adding authentication/authorization enforcement
- Adding request logging, correlation IDs, and audit trails
- Validating requests before controller execution
- Implementing rate limiting or feature flags
- Introducing error boundaries for async handlers
- Debugging “middleware order” issues

## Inputs
- The middleware's responsibility and scope (global vs route-specific)
- Where the middleware should run in the request lifecycle (before/after auth, before validation, etc.)
- What context the middleware reads/writes (e.g., user identity, request ID)

## Outputs
- A middleware function with clear invariants
- A documented ordering decision
- A minimal verification plan (happy path + one failure case)

## Middleware ordering (typical)
A common order for HTTP services:

1. **Request context**
   - correlation/request ID
   - structured logging context

2. **Parsing**
   - JSON/body parsing, multipart parsing

3. **Authentication**
   - session / token validation

4. **Authorization**
   - role/permission checks

5. **Validation**
   - params/query/body validation

6. **Business handlers**
   - controller execution (delegates to service)

7. **Error middleware**
   - final error mapping and logging/tracking

## Rules
- Middleware MUST be single-purpose and composable.
- Middleware MUST NOT embed business logic (belongs in services).
- Middleware that adds context SHOULD attach the context to a typed request object (or `res.locals` pattern).
- Error middleware MUST be last in the chain.

## Steps
1. Define the middleware contract:
   - inputs the middleware reads
   - outputs/side effects the middleware writes
   - failure modes (status code + error shape)
2. Decide where the middleware sits in the chain (and why).
3. Implement:
   - short, readable logic
   - consistent error mapping
4. Add a focused test:
   - one success case
   - one failure case
5. Verify in a running service:
   - confirm ordering is correct (logs/context present)

## Verification

- [ ] Middleware executes in the documented order
- [ ] Middleware correctly calls `next()` or terminates the response
- [ ] Auth middleware rejects unauthenticated requests with 401
- [ ] Error middleware catches and formats all upstream errors
- [ ] Request/correlation ID is present in logs for traced requests
- [ ] One success and one failure test exist for each middleware

## Boundaries

- MUST NOT embed business logic in middleware (delegate to services)
- MUST NOT modify request/response outside documented responsibilities
- MUST NOT skip error middleware registration (must be last)
- MUST NOT assume middleware order without explicit documentation
- SHOULD NOT create middleware with multiple unrelated responsibilities
- SHOULD NOT block the event loop with synchronous operations in middleware

## Included assets
- Templates: `./templates/` contains middleware scaffolds and async error wrappers.
- Examples: `./examples/` contains common middleware patterns.
