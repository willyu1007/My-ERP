# Example: Discriminated union for async state

Instead of multiple booleans (`isLoading`, `isError`), use a single state machine:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function isSuccess<T>(s: AsyncState<T>): s is { status: 'success'; data: T } {
  return s.status === 'success';
}
```

Benefits:
- impossible states are eliminated
- rendering logic is clearer
