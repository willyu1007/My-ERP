# Example: Callback stability

Use `useCallback` when a stable callback reference is required (e.g., memoized children).

Avoid `useCallback` if:
- the callback is not passed to memoized children
- the callback is not a dependency of another hook
- the additional indirection reduces readability
