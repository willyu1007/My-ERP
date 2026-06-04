# Example: Refining `unknown`

Prefer:

```ts
function isUser(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && 'id' in value;
}
```

Over:

```ts
const user = value as any;
```
