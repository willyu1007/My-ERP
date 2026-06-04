# Example: Correlation ID middleware

## Goal
Attach a stable request identifier to every request so logs and error reports can be correlated.

## Pattern
- If the client sends a request ID header, reuse it.
- Otherwise, generate a new ID.
- Attach the ID to:
  - response header (for client visibility)
  - logger context
  - error tracking context
