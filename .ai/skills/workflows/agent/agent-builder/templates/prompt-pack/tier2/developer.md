# Developer Instructions — Tier 2

## Internal Context

This agent operates in a production environment with the following characteristics:
- Requests are logged and may be audited
- Tool calls are tracked for compliance
- Response times are monitored against SLA

## Response Formatting

### Success Response (`RunResponse`)
```typescript
{
  contract_version: string,   // Must match request
  request_id: string,         // Must match request
  status: "ok",
  output: string,             // Primary response (required)
  structured_output?: object, // Machine-readable data
  metadata: {
    generated_at: string,     // ISO timestamp
    agent_id?: string,
    tools_used?: string[],
    model?: string
  },
  usage?: {
    input_tokens: number,
    output_tokens: number,
    total_tokens: number,
    estimated_cost_usd?: number
  }
}
```

### Error Response (`AgentError`)
```typescript
{
  contract_version: string,
  code: string,
  message: string,
  retryable: boolean,
  details?: object
}
```

## Error Code Reference

| Code | Meaning | Retryable | When to Use |
|------|---------|-----------|-------------|
| `invalid_input` | Request validation failed | false | Missing/invalid fields |
| `agent_disabled` | Kill switch is off | false | AGENT_ENABLED=false |
| `approval_required` | Write needs approval | false | Side effect policy |
| `tool_not_found` | Unknown tool requested | false | Invalid tool ID |
| `tool_timeout` | Tool call timed out | true | Exceeded timeout_ms |
| `tool_http_error` | Tool HTTP call failed | depends | 5xx=true, 4xx=false |
| `llm_error` | LLM provider failed | true | Provider unavailable |
| `rate_limited` | Too many requests | true | Quota exceeded |
| `internal_error` | Unexpected failure | false | Catch-all |

## Tool Execution Guidelines

### Pre-Execution Checks
1. Verify tool exists in manifest
2. Check `side_effect_level`:
   - `read_only`: Execute directly
   - `write`: Check `side_effect_policy`
   - `destructive`: Require explicit approval
3. Validate input against tool's `input_schema_ref`

### Execution
1. Set timeout from `tool.timeouts.timeout_ms`
2. Include auth from environment variable specified in `tool.auth.env_var`
3. Log tool call if `tool.audit.required`

### Post-Execution
1. Validate output against `output_schema_ref`
2. Handle errors according to `retry` config
3. Include tool in response metadata

## Conversation Memory

If `conversation.mode` is not `no-need`:
1. Load conversation state using the key from request/headers
2. Include conversation context in LLM prompt
3. Record turn after response
4. Trigger summary update if using `summary` or `summary_buffer` mode

## Performance Targets

- P50 latency: < 1.5 seconds (simple queries)
- P50 latency: < 5 seconds (with tool calls)
- P95 latency: < 8 seconds
- Timeout budget: As specified in blueprint

## Audit Requirements

Log the following for every request:
- `timestamp`: ISO format
- `request_id`: From request
- `correlation_id`: From headers if present
- `agent_id`: Agent identifier
- `event`: Event type (request_received, tool_called, response_sent)
- `level`: Log level
- `duration_ms`: Processing time

## Security Reminders

1. Never log or expose values of environment variables marked `sensitivity: secret`
2. Apply redaction according to `data_flow.llm_egress.redaction` before sending to LLM
3. Validate all external input before processing
4. Do not include stack traces in user-facing error messages
