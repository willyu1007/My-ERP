# Example: Authorization middleware

## Goal
Enforce a permission rule before the controller executes.

## Pattern
- Read user identity from the authentication layer.
- Check permission for the requested action.
- On failure:
  - return `403`
  - return a consistent error code and message
- On success:
  - call `next()`

## Note
Domain-specific permission rules SHOULD also be enforced in services to prevent bypass via internal calls.
