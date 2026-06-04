# Example: UX state acceptance criteria

For a data-driven screen:

- Loading:
  - visible indicator within 200ms
  - layout stable where possible (skeletons)
- Empty:
  - clear explanation of “no results”
  - suggests next action (change filters, create item)
- Error:
  - user-safe message
  - retry action when appropriate
  - optional support ID / correlation ID
