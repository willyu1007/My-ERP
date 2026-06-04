# Runtime calling guidelines

This document standardizes how product code calls into the LLM layer.

The guiding principle is: **feature code passes intent and context; the LLM layer decides providers/models, budgets, retries, and telemetry**.

## Canonical API shape (conceptual)

All calls should be representable as:

```text
generateText(context, { profile_id, prompt_template_id, version, variables, user_input, options })
```

Where `context` is the request-scoped execution context.

## Execution context (required)

The LLM layer should accept a single `execution_context` object and treat it as the *only* source for:

- `tenant_id` / `org_id`
- `user_id`
- `roles` / entitlements
- `trace_id` / `request_id`
- `locale` / `timezone`
- `privacy_classification` (e.g., PII, confidential)
- `budget` (max tokens / max cost)

### Rules

- Context MUST be propagated from the edge (API gateway) to the LLM layer.
- Context MUST be logged/metric-tagged **without** logging raw user content.
- Context MUST be used for policy enforcement (allowed profiles/models, max spend).

## Request construction

### Prefer profiles over raw model strings

Feature code SHOULD request a `profile_id` (e.g., `balanced`, `quality`) rather than directly specifying `provider_id` + `model_id`.

Allow raw override only for:

- debugging
- migration phases
- admin-only internal tools

### Prompt templates

Feature code MUST reference prompts by:

- `prompt_template_id`
- immutable `version`

Variables MUST be passed as a single `variables` object.

## Reliability and safeguards

### Timeouts

- All calls MUST have a deadline.
- Default timeouts belong in the LLM layer (registry/config), not in feature code.

### Retries

Retries MUST be applied centrally and only for safe error classes.

Recommended default:

- retry on transient network + 5xx
- bounded attempts (e.g., 1–2)
- exponential backoff with jitter

### Concurrency limits

Apply per-tenant and per-user concurrency limits where feasible.

### Streaming

Streaming is an output mode. Keep a single abstraction that can:

- stream tokens/chunks
- stop early
- handle mid-stream provider failures

## Error taxonomy (recommended)

Normalize provider errors into a stable set:

- `INVALID_REQUEST`
- `UNAUTHORIZED`
- `RATE_LIMITED`
- `BUDGET_EXCEEDED`
- `TIMEOUT`
- `PROVIDER_UNAVAILABLE`
- `INTERNAL_ERROR`

Product code should branch on these categories, not provider-specific errors.

## Privacy

- Do not log prompt/user content by default.
- Redact obvious secrets and PII if you must log for debugging.
- Use sampling for verbose debug logs.

## Verification checklist

- [ ] Feature code uses the single LLM client surface (no provider SDK imports)
- [ ] Uses `profile_id` or approved override path
- [ ] Prompt referenced by `prompt_template_id` + `version`
- [ ] `execution_context` is passed and includes `trace_id`
- [ ] Timeouts and retries are configured centrally
- [ ] Telemetry emitted (latency, tokens, provider/model/profile)

Next documents:

- `config-registry.md`
- `prompt-governance.md`
