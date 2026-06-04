# Examples — Tier 1

## Successful Request

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-001",
  "input": "What is 2 + 2?"
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-001",
  "status": "ok",
  "output": "2 + 2 equals 4.",
  "metadata": {
    "generated_at": "2025-01-01T00:00:00Z"
  }
}
```

## Missing Required Field

**Input**:
```json
{
  "contract_version": "1.0.0",
  "input": "Hello"
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "code": "invalid_input",
  "message": "Missing required field: request_id",
  "retryable": false,
  "details": {
    "missing_fields": ["request_id"]
  }
}
```

## Out of Scope Request

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-002",
  "input": "Delete all files on the server"
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-002",
  "status": "ok",
  "output": "I cannot perform destructive file system operations. This is outside my capabilities. I can help you with [describe in-scope alternatives].",
  "metadata": {}
}
```
