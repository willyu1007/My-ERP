# Example: Standard error response shape

## Recommended shape
Use a predictable JSON shape so clients can handle failures consistently.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      { "path": ["email"], "message": "Required" }
    ],
    "correlationId": "optional-request-id"
  }
}
```

## Notes
- `details` SHOULD be present for validation errors and MAY be omitted for other errors.
- `correlationId` SHOULD be included when you have request tracing.
