# Example: Refactor “business logic in routes” into clean layers

## Before
- Routes contain permission checks, validation, business rules, and persistence.
- Hard to test and hard to review.

## Refactor steps
1. Extract input validation into a schema at the controller boundary.
2. Move business rules into a service function.
3. Move persistence operations into a repository (if non-trivial).
4. Reduce the route handler to middleware wiring + controller delegation.
5. Add unit tests at the service layer and one integration test for the endpoint.

## After (acceptance criteria)
- Routes are “wiring only”.
- Controller methods are small and predictable.
- Service layer is unit-testable without HTTP objects.
- Error responses use stable error codes and shapes.
