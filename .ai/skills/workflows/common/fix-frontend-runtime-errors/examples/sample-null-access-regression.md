# Example: Fix a null/undefined access regression

## Context
A page started crashing after a backend response change. The UI shows a blank screen and the console logs:

```
TypeError: Cannot read properties of undefined (reading 'map')
  at OrdersTable (OrdersTable.tsx:42)
```

## Reproduction
1. Navigate to `/orders`.
2. Filter by a customer with no recent orders.
3. The page crashes.

## Diagnostics collected
- Stack trace points to `OrdersTable.tsx:42`.
- Network log shows `GET /api/orders?...` returning:

```json
{
  "items": null,
  "total": 0
}
```

## Root cause
The UI assumed `items` is always an array and calls `items.map(...)`. For the empty state, the backend now returns `null`.

## Minimal fix
Normalize the response at the boundary (data mapping layer) and render an explicit empty state.

### Patch sketch
- In the data mapping function:

```ts
const items = Array.isArray(resp.items) ? resp.items : [];
return { ...resp, items };
```

- In the component:

```tsx
if (items.length === 0) return <EmptyState title="No orders" />;
```

## Verification
- Re-run the reproduction steps: page no longer crashes.
- Confirm the empty state renders.
- Confirm non-empty customers still render the table.
- Confirm no new console errors.

## Follow-up (optional)
- Add a contract test for `GET /api/orders` to guarantee `items` is always an array, or document nullability explicitly.
