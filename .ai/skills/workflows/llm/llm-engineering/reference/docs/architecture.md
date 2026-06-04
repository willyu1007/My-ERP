# Reference architecture for LLM features

This document describes a **general** architecture for integrating and operating LLM capabilities across one or more providers.

The design goals are:

1. **Consistency**: a single calling surface and shared conventions across all product features.
2. **Safety**: secrets never in code, consistent privacy policy, and bounded failure modes.
3. **Control**: routing profiles, budgets, and release gates are centrally managed.
4. **Observability**: every call is traceable and cost-attributable.

> This repository is a template. The “modules” below may map to services/libraries/packages depending on your actual system.

## Logical components

### 1) LLM Client / Gateway (the single calling surface)

**Responsibility:** expose a stable API to the rest of the codebase.

Typical responsibilities:

- Validate inputs and `execution_context`
- Resolve `model_profile` → provider/model candidates
- Resolve credentials via `credential_ref`
- Apply timeouts, retries, concurrency limits, and fallbacks
- Emit telemetry (trace/log/metrics) and cost attribution
- Normalize provider-specific responses/errors into a common schema

Anti-patterns:

- Feature code importing provider SDKs directly
- Per-feature “mini gateways” with divergent configs and error handling

### 2) Provider adapters

**Responsibility:** isolate provider-specific SDK differences behind a small interface.

Guidelines:

- Keep adapters thin; push policy decisions (retries, routing) into the gateway
- Normalize:
  - streaming vs non-streaming behavior
  - tool/function calling formats (if used)
  - error taxonomy
  - token accounting fields (when available)

### 3) Registries (SSOT)

Registries provide stable identifiers and avoid “magic strings” spread across the repo.

- `providers.yaml`: known providers and their supported capabilities
- `model_profiles.yaml`: business-level profiles mapped to candidate models
- `prompt_templates.yaml`: versioned prompt templates
- `config_keys.yaml`: allow-list for LLM configuration keys/environment variables

If your production system stores these in a DB/config service, keep the same IDs and treat these files as:

- a source-of-truth for code review
- a local/dev fallback
- documentation for how values are structured

### 4) Prompt registry (versioned)

**Responsibility:** centralize prompt templates, variables schema, and evaluation results.

Key rules:

- Prompts are referenced by `prompt_template_id` + immutable `version`
- Variables are strongly typed (schema)
- Changes must have regression evidence before promotion

### 5) Policy & budgets

**Responsibility:** enforce per-tenant/per-user constraints.

Examples:

- Max tokens per request
- Max spend per request/day
- Which profiles/models are allowed for a tenant
- Privacy classification restrictions

Policy inputs should come from `execution_context` and a policy store, not from feature code.

## Canonical request model

All LLM calls should be representable as a single canonical request envelope (even if your runtime API differs):

```text
LLMRequest {
  execution_context { tenant_id, user_id, roles, trace_id, budget, privacy_classification, ... }
  model_profile | (provider_id, model_id)
  prompt_template_id + version
  variables { ... }
  user_input { ... }
  options { streaming, temperature, max_output_tokens, ... }
}
```

## Canonical response model

Prefer a normalized response shape:

```text
LLMResponse {
  output_text
  structured_output?   // optional
  usage { input_tokens, output_tokens, ... }
  provider { provider_id, model_id, request_id }
  timings { ... }
  safety { ... }
}
```

## Failure modes (design for bounded outcomes)

- Provider timeouts / 5xx
- Rate limits
- Partial streaming failures
- Invalid credentials
- Prompt/template not found
- Budget exceeded

Recommended handling:

- Retry only on safe classes (transient network, 5xx, some rate limits)
- Prefer **fast fail** on invalid configuration or missing registry entries
- Use fallbacks by profile, not by feature-specific ad-hoc logic

## Implementation guidance (repo-agnostic)

- Put the single calling surface in a shared library/module (or a dedicated “gateway” service) that is easy to audit.
- Expose a small API: `generateText()`, `generateStructured()`, `embed()`, etc.
- Centralize defaults and allowed overrides.
- Keep provider adapters isolated, ideally with contract tests.

Next documents:

- `provider-onboarding.md`
- `runtime-calling.md`
- `config-registry.md`
