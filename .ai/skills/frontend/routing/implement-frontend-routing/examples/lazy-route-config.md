# Example: Route with lazy loading (conceptual)

## Pattern
- Define a route config entry.
- Lazy load the page component.
- Wrap in:
  - a loading boundary
  - an error boundary (optional)

## Acceptance criteria
- The route loads on navigation and direct URL entry.
- Loading state is visible for slow networks.
- Errors are user-safe and actionable.
