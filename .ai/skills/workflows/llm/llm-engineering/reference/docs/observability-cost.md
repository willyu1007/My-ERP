# Observability & cost attribution

This document defines minimum telemetry requirements for LLM calls.

Goals:

- diagnose failures quickly (provider, routing, timeouts)
- attribute cost by tenant/user/feature
- support safe experimentation (A/B, canary) with reliable measurements

## What to capture (minimum)

### Request metadata

- `trace_id` / `request_id`
- `tenant_id` / `org_id`
- `user_id` (or a stable anonymized identifier)
- `feature_id` (or product surface label)
- `profile_id`
- `provider_id`, `model_id`

### Outcome and timing

- `status` (success / error category)
- `latency_ms`
- `retry_count`
- provider request id (if available)

### Usage and cost

- `input_tokens`, `output_tokens` (best effort)
- `estimated_cost` (if you have a pricing map)
- `budget_max` (if enforced)

## Logging rules

- Do not log raw prompt or user content by default.
- If debug logging is needed, use:
  - sampling
  - redaction
  - short retention

## Metrics (recommended)

- request count by `provider_id`/`model_id`/`profile_id`
- error rate by error category
- p50/p95 latency by provider/model
- token usage totals by tenant/profile

## Tracing

Create a trace span for each call with attributes:

- provider/model/profile
- latency
- error category

Do not attach full prompts to trace attributes in production.

## Cost governance

If you enforce budgets, cost/usage should be part of policy decisions:

- reject/limit calls when budget exceeded
- downshift profile or use fallback models when allowed

Next documents:

- `release-regression.md`
