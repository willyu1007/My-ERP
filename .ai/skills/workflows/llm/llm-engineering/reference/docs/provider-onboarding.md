# Provider onboarding (adding a new LLM provider)

This document defines a **safe, repeatable** process for integrating a new LLM provider.

## Design intent

Adding a provider should:

- Require **minimal changes** outside the provider adapter and registries
- Never introduce secrets into the repo (use `credential_ref`)
- Provide consistent error handling, telemetry, and token/cost accounting
- Be reversible (feature flags + safe fallback)

## Pre-flight checklist

Before writing code:

- [ ] Confirm the provider is needed (capability, latency, cost, compliance)
- [ ] Confirm the provider API surface you need (chat, embeddings, tools, streaming)
- [ ] Confirm the authentication method and how secrets will be stored (Vault/KMS/Secrets Manager)
- [ ] Confirm data handling and retention constraints

## Integration steps

### 1) Register the provider (SSOT)

Update:

- `.ai/llm-config/registry/providers.yaml`

Guidelines:

- Assign a stable `provider_id` (kebab-case)
- Declare supported capabilities and default timeouts/retries
- Document any known limitations (regions, token limits, streaming constraints)

### 2) Define credential indirection

Do **not** store API keys in code.

Instead:

- Use a `credential_ref` (e.g., `vault://...`, `aws-secrets://...`)
- Ensure your runtime has a **credential resolver** that can fetch the secret at call time

Register any new configuration keys (if required) in:

- `.ai/llm-config/registry/config_keys.yaml`

Then run:

```bash
node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs
```

### 3) Implement a provider adapter

Implement a thin adapter that conforms to your gateway/client interface.

Adapter MUST:

- Map provider errors into a normalized error taxonomy
- Preserve provider request IDs for support/debugging
- Support streaming if the provider supports it
- Avoid embedding policy decisions (routing, budgets) inside adapter logic

Adapter SHOULD:

- Provide deterministic token accounting (best-effort if provider is imperfect)
- Expose capability flags (supports JSON schema, tools/function calling, etc.)

### 4) Add contract tests

At minimum:

- A request/response “golden” test against a mock/stubbed provider client
- Error mapping tests (rate limit, invalid credentials, 5xx, timeout)
- Streaming tests (start → chunks → end, and error mid-stream)

If you can run live tests in CI, gate them behind:

- explicit opt-in (secrets available)
- strict timeouts
- cost budgets

### 5) Add telemetry + cost attribution

Required fields (see `observability-cost.md`):

- trace id, tenant id, user id (or anonymized)
- provider id, model id, profile id
- token usage (in/out) and cost (if possible)
- latency, retry count, outcome

### 6) Rollout strategy

Use a staged rollout:

- dark launch (disabled by default)
- canary to a small tenant subset
- percentage rollout
- full enablement

Always provide a fallback profile/provider path.

## Definition of Done (DoD)

- [ ] Provider registered in `providers.yaml`
- [ ] No secrets committed; uses `credential_ref`
- [ ] Adapter implements normalized behavior and error mapping
- [ ] Contract tests added and passing
- [ ] Telemetry and cost fields emitted
- [ ] Rollout plan documented (flags + fallback)

## Common failure modes

- **Silent drift**: provider/model strings spread across code. Fix: registry-first IDs.
- **Retry storms**: retries without backoff/jitter. Fix: gateway-level retry policy.
- **Leaky errors**: raw provider SDK errors exposed to product code. Fix: normalized error taxonomy.

Next documents:

- `architecture.md`
- `runtime-calling.md`
- `observability-cost.md`
