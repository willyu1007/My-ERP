# Example: Service unit test (conceptual)

## Scenario
`UserService.create()` should:
- reject underage users
- reject duplicate emails
- create a user otherwise

## Assertions
- underage → throws validation error
- duplicate email → throws conflict error
- success → calls `repo.create` once and returns created user
