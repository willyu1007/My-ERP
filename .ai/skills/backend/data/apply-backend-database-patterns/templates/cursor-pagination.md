# Template: Cursor pagination contract

## Recommended request parameters
- `limit` (int, required, bounded)
- `cursor` (opaque string, optional)

## Recommended response shape
```json
{
  "data": [/* items */],
  "page": {
    "nextCursor": "opaque-or-null",
    "hasMore": true
  }
}
```

## Notes
- `cursor` SHOULD encode (or reference) a stable sort key, such as `(createdAt, id)`.
- Ordering MUST be deterministic.
