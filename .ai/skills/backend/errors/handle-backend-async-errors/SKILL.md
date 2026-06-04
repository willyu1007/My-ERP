---
name: handle-backend-async-errors
description: Handle async/await and error propagation in backend services with consistent error types, wrappers, and response mapping.
---

# Handle Backend Async and Errors

## Purpose
Reduce production failures caused by unhandled async errors and inconsistent error mapping by standardizing async patterns and error taxonomy.

## When to use
Use this skill when you are:
- Implementing async controllers or middleware
- Introducing custom error types and mapping to HTTP
- Debugging unhandled promise rejections
- Refactoring `.then()` chains to `async/await`
- Implementing parallel async operations safely

## Inputs
- The async operation(s) (controller/service/repository)
- Desired error contract (operational vs unknown errors)
- The framework’s error handling mechanism (e.g., Express `next(err)`)

## Outputs
- A consistent async handler pattern that forwards errors correctly
- A small set of custom errors with stable codes
- An error propagation plan (where errors are logged/tracked, where they are mapped)

## Core rules
- Async handlers MUST propagate errors to the framework error boundary.
- Operational errors SHOULD be represented with explicit types (or codes).
- Unknown errors MUST be logged/tracked and mapped to `5xx`.
- Code SHOULD prefer `async/await` over nested promise chains for readability.

## Steps
1. Identify where errors must be caught:
   - controller boundary
   - middleware boundary
   - job/worker boundary
2. Standardize error types (validation, not found, forbidden, conflict).
3. Implement an async wrapper (if your framework needs it).
4. Ensure error middleware exists and is last in the chain.
5. Add one test for:
   - an operational error mapping
   - an unknown error mapping

## Verification

- [ ] Async errors in controllers are propagated to the framework error boundary
- [ ] Operational errors map to correct HTTP status codes (4xx)
- [ ] Unknown errors map to 500 and are logged/tracked with context
- [ ] No unhandled promise rejections in application logs
- [ ] Error middleware is last in the middleware chain
- [ ] `Promise.all` failures are handled and do not leave dangling promises

## Boundaries

- MUST NOT swallow errors silently (always log or propagate)
- MUST NOT return 500 for known operational errors (use explicit status codes)
- MUST NOT expose internal error details to clients in production
- MUST NOT mix `.then()` chains and `async/await` in the same function
- SHOULD NOT catch errors without re-throwing or logging
- SHOULD NOT use generic `catch` blocks without error type checking

## Included assets
- Templates: `./templates/` includes error types and async handler wrappers.
- Examples: `./examples/` includes safe `Promise.all` usage and common pitfalls.
