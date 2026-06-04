# Example: Inventory entry (redacted)

```json
{
  "method": "GET",
  "path": "/api/users/:id",
  "auth": "required",
  "request": {
    "params": { "id": "string" },
    "query": {},
    "bodyShapeNotes": "N/A"
  },
  "response": {
    "successStatus": 200,
    "successShapeNotes": "{ data: { id, email, name } }"
  },
  "examples": {
    "valid": null,
    "invalid": null
  },
  "notes": "Verify permission rule for non-admin callers."
}
```
