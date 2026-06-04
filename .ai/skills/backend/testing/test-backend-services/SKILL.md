---
name: test-backend-services
description: Design and implement backend tests (unit, integration) for services and HTTP endpoints with clear acceptance criteria.
---

# Test Backend Services

## Purpose
Provide a practical testing strategy for backend services that balances confidence, speed, and maintainability.

## When to use
Use this skill when you are:
- Adding a new service method or business rule
- Adding or modifying an endpoint
- Fixing regressions and adding coverage
- Introducing test fixtures, factories, or test data builders

## Inputs
- Business rules and expected outcomes
- Endpoint contract (if testing HTTP)
- Persistence requirements (if integration tests verify DB side effects)
- Existing testing framework and conventions

## Outputs
- A test plan (unit + integration) with acceptance criteria
- Unit tests for service logic (mocked dependencies)
- Integration tests for HTTP behavior (optional but recommended)

## Rules
- Business rules MUST be covered by unit tests at the service layer.
- Integration tests SHOULD cover at least one happy-path request for each new endpoint.
- Tests MUST be deterministic and isolated (no reliance on external shared state).
- Tests MUST NOT require real credentials.

## Recommended test pyramid
1. **Unit tests**
   - fast
   - focus on business logic
   - dependencies mocked

2. **Integration tests**
   - verify wiring and persistence
   - run against an isolated DB (ephemeral or test container)

3. **End-to-end tests**
   - optional
   - use sparingly for critical flows

## Steps
1. Identify critical behaviors and failure modes.
2. Write service unit tests first:
   - success path
   - one representative domain error (e.g., conflict)
3. Add endpoint integration test (when applicable):
   - request validation and response shape
   - database side effects (if any)
4. Add fixtures/builders to reduce boilerplate.
5. Verify tests run reliably in CI.

## Verification

- [ ] Unit tests pass with mocked dependencies (no real DB/network)
- [ ] Integration tests pass against an isolated test database
- [ ] Tests are deterministic (no flaky failures)
- [ ] Tests run successfully in CI environment
- [ ] Business rules have corresponding unit tests
- [ ] At least one happy-path integration test exists for each endpoint

## Boundaries

- MUST NOT use real credentials in tests
- MUST NOT depend on shared external state (tests must be isolated)
- MUST NOT skip test cleanup (reset DB state between tests)
- MUST NOT test implementation details (test behavior, not internals)
- SHOULD NOT mock everything (integration tests need real wiring)
- SHOULD NOT write end-to-end tests for every scenario (use sparingly)

## Included assets
- Templates: `./templates/` includes unit and integration test scaffolds.
- Examples: `./examples/` includes a service unit test example.
