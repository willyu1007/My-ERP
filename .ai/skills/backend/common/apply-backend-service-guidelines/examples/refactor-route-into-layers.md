# Example: Refactor “fat route” into layers

## Scenario
A route handler accumulated permission checks, validation, and persistence logic. You want to make it testable and maintainable.

## Before
- Route handler does validation, authorization, business rules, and database writes in one function.
- Hard to unit test without HTTP and database.

## After (target shape)
1. **Route**
   - Only registers middleware and delegates to a controller method.

2. **Controller**
   - Validates input
   - Calls service
   - Maps errors to HTTP responses

3. **Service**
   - Enforces business rules
   - Orchestrates repositories
   - Returns domain result

4. **Repository**
   - Encapsulates persistence

## Acceptance criteria
- The route handler is ≤ ~10 lines (excluding middleware wiring).
- Service can be unit tested without HTTP objects.
- Validation errors map to `400`.
- Domain rule violations map to a specific `4xx` (e.g., `403`, `409`).
