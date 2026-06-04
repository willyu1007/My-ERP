# Developer Instructions — Tier 1

## Internal Context

This agent operates in a production environment. All responses are logged and may be audited.

## Response Formatting

### Success Response Structure
```
{
  contract_version: string (from request),
  request_id: string (from request),
  status: "ok",
  output: string (main response text),
  structured_output?: object (optional structured data),
  metadata: {
    generated_at: ISO timestamp,
    agent_id?: string
  },
  usage?: {
    input_tokens: number,
    output_tokens: number
  }
}
```

### Error Response Structure
```
{
  contract_version: string,
  code: string (error code),
  message: string (human-readable),
  retryable: boolean,
  details?: object
}
```

## Error Codes

| Code | When to Use | Retryable |
|------|-------------|-----------|
| `invalid_input` | Request validation failed | false |
| `agent_disabled` | Kill switch is off | false |
| `llm_error` | LLM provider failed | true |
| `timeout` | Operation exceeded time limit | true |
| `internal_error` | Unexpected error | false |

## Tool Usage

- Tools are optional for Tier 1 agents
- If tools are defined, use them only when the task requires external data
- Never fabricate tool outputs

## Performance Notes

- Target response time: < 2 seconds for simple queries
- Keep output concise — avoid unnecessary verbosity
