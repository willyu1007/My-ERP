# {{agent_name}} — Runbook

## Kill switch
- Env: `AGENT_ENABLED`
- Behavior: when disabled, HTTP should return 503 with `AgentError` (retryable=false).

## Health checks
- `GET {{api_base_path}}{{api_health_path}}`

## Common failure modes
- LLM provider errors / timeouts
- Tool invocation failures
- Schema validation failures

## Reliability
- failure_contract.mode: {{failure_mode}}
- retry/backoff: see blueprint worker/tools settings
- idempotency: see blueprint worker/tools settings

## Rollback / disable
- method: {{rollback_method}}
- notes: {{rollback_notes}}

## Observability
### Required log fields
{{log_fields_list}}

### Alerts
{{alerts_list}}

## Performance and cost budgets
- latency: p50={{latency_p50}}ms, p95={{latency_p95}}ms, timeout={{timeout_budget}}ms
- throughput: rps={{throughput_rps}}, concurrency={{throughput_concurrency}}
- tokens: in={{max_input_tokens}}, out={{max_output_tokens}}
- cost: max_usd_per_task={{max_usd_per_task}}

