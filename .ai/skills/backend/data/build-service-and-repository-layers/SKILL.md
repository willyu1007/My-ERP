---
name: build-service-and-repository-layers
description: Build backend service and repository layers to isolate business logic from persistence and improve testability.
---

# Build Service and Repository Layers

## Purpose
Provide patterns for structuring business logic (services) and persistence (repositories) so code is modular, testable, and maintainable.

## When to use
Use this skill when you are:
- Implementing domain/business rules
- Refactoring complex persistence workflows out of controllers
- Introducing dependency injection (DI) for testability
- Designing repository interfaces for non-trivial queries
- Creating service boundaries across modules

## Inputs
- Domain use cases and business rules
- Data model and persistence requirements
- Existing conventions (DI framework or manual injection, ORM/query layer)
- Error contract and transaction requirements

## Outputs
- Service API design (method names, inputs, outputs)
- Repository interfaces and implementations (where needed)
- Dependency boundaries and DI strategy
- Unit-test strategy for services

## Rules
- Services MUST NOT depend on HTTP or framework-specific objects.
- Repositories MUST encapsulate persistence details.
- Controllers SHOULD call services, not repositories.
- Services SHOULD be designed for unit testing (inject dependencies).

## Service design guidelines
- Keep methods small and intention-revealing.
- Prefer pure helper functions for complex computations.
- Use domain-specific errors (e.g., conflict, not found) instead of returning sentinel values.

## Repository design guidelines
- Design repository methods around domain needs, not ORM primitives.
- Prefer explicit inputs and explicit ordering.
- Do not leak ORM types to upper layers unless the codebase intentionally standardizes on them.

## Steps
1. Identify the business operation (use case) and expected outcomes.
2. Define a service method signature (input DTO, output type, errors).
3. Identify persistence needs:
   - reads
   - writes
   - transaction boundaries
4. Define repository interfaces for non-trivial persistence operations.
5. Implement service orchestration:
   - validate domain rules
   - call repositories
   - map errors
6. Add unit tests:
   - mock repositories
   - test business rules and error cases

## Verification

- [ ] Service methods are unit-testable with mocked repositories
- [ ] Service does not depend on HTTP/framework-specific objects (e.g., `req`, `res`)
- [ ] Repository methods encapsulate persistence details (no ORM leakage to services)
- [ ] Controllers delegate to services (not directly to repositories)
- [ ] Domain errors are explicit types, not sentinel values or generic exceptions
- [ ] Unit tests cover success path and at least one domain error case

## Boundaries

- MUST NOT import HTTP/framework modules in service layer
- MUST NOT bypass service layer to call repositories from controllers
- MUST NOT return ORM entities directly from services (map to DTOs if needed)
- MUST NOT embed business logic in repositories
- SHOULD NOT create circular dependencies between services
- SHOULD NOT mix multiple unrelated responsibilities in a single service

## Included assets
- Templates: `./templates/` includes DI-friendly service and repository skeletons.
- Examples: `./examples/` includes a full service with DI and a repository implementation.
