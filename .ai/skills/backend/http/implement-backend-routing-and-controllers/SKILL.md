---
name: implement-backend-routing-and-controllers
description: Implement or refactor backend HTTP routing and controllers using a layered pattern (routes delegate, controllers validate and call services).
---

# Implement Backend Routing and Controllers

## Purpose
Provide a repeatable way to define HTTP routes and implement controllers that validate input, call services, and return consistent responses.

## When to use
Use this skill when you are:
- Adding a new endpoint (GET/POST/PUT/PATCH/DELETE)
- Refactoring endpoints with “fat routes”
- Standardizing controller error handling and response shapes
- Introducing request validation at the HTTP boundary

## Inputs
- Endpoint contract: method, path, authentication/authorization requirements
- Request input shapes (params/query/body)
- Response shape (success and failure)
- Service function(s) the controller will call

## Outputs
- Route registration that wires middleware and delegates to controller methods
- Controller methods with:
  - input validation
  - service calls
  - consistent success responses
  - consistent error mapping

## Required rules
- Routes MUST NOT contain business logic.
- Controllers MUST NOT contain persistence queries (unless the codebase intentionally collapses layers).
- Controllers MUST validate untrusted inputs (params/query/body).
- Controllers MUST map errors to consistent HTTP responses.

## Controller responsibilities
A controller SHOULD:
- Validate and normalize inputs
- Translate service results into a response DTO
- Choose the appropriate status code (`200`, `201`, `204`, etc.)
- Map operational errors to `4xx` / `5xx` consistently

A controller SHOULD NOT:
- Implement business rules (belongs in services)
- Contain database queries (belongs in repositories)

## Route responsibilities
A route SHOULD:
- Register middleware in the correct order
- Delegate to a controller method
- Avoid inline logic beyond trivial parameter passing

## Steps
1. Define the endpoint contract (method, path, auth, request/response).
2. Add route registration:
   - register middleware
   - delegate to controller method
3. Implement controller method:
   - validate inputs
   - call service
   - return a consistent response
4. Add or update validation schemas.
5. Verify behavior with:
   - one happy-path call
   - one validation failure
   - one auth/permission failure (if applicable)

## Verification

- [ ] Route handler is short and delegates immediately
- [ ] Controller validates all external inputs
- [ ] Response payload matches the documented shape
- [ ] Errors map to consistent `4xx`/`5xx` with stable error codes
- [ ] Happy-path request returns expected status and response
- [ ] Validation failure returns structured error

## Boundaries

- MUST NOT embed business logic in routes
- MUST NOT embed persistence queries in controllers
- MUST NOT skip input validation for external data
- MUST NOT return inconsistent error shapes across endpoints
- SHOULD NOT create fat controllers (keep them thin, delegate to services)
- SHOULD NOT bypass error mapping middleware

## Included assets
- Templates: `./templates/` provides router and controller scaffolds.
- Examples: `./examples/` includes a complete controller, route file, and refactoring walkthrough.
