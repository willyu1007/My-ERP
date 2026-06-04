# Procedure: Add / integrate an LLM provider

**Base (references):** `.ai/skills/workflows/llm/llm-engineering/reference/`

## Goal
Integrate a new provider **behind a single calling surface** (adapter/gateway/client), with:
- registry-first IDs and config keys
- no secrets in repo
- normalized errors + telemetry
- rollback/fallback plan

## Inputs (collect before edits)
- Provider name + API surface (chat, embeddings, streaming, tools)
- Auth method (API key / OAuth / managed identity)
- Compliance constraints (data locality, retention)
- Desired rollout (canary, gradual, full)

## Steps
1) **Define stable identifiers**
   - Choose `provider_id` (kebab-case). Do not overload an existing ID.

2) **Register provider (SSOT)**
   - Edit: `.ai/llm-config/registry/providers.yaml`
   - Capture: endpoint/regions, supported features, default timeouts, rate limits, notes.

3) **Credentials: reference, don’t store**
   - Use `credential_ref` (non-secret pointer to your secrets manager).
   - If new env/config keys are introduced:
     - Register them in: `.ai/llm-config/registry/config_keys.yaml`
     - Run: `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`

4) **Implement/extend the provider adapter (repo-specific)**
   - The adapter must:
     - map the canonical request envelope → provider request
     - normalize provider responses → canonical response
     - normalize error taxonomy (auth, rate limit, timeout, transient, fatal)
     - support streaming if required

5) **Observability + cost attribution**
   - Ensure each call emits trace/log attributes:
     - `provider_id`, `model_id`, `profile_id`, `prompt_template_id`, `prompt_version`, `tenant_id`, `user_id`, `trace_id`
   - Add metrics for: latency, error rate, tokens, cost.

6) **Tests (minimum contract coverage)**
   - Add tests for:
     - happy path
     - invalid credentials
     - rate limiting
     - timeout
     - 5xx / transient errors + retry behavior

7) **Rollout + fallback**
   - Guard behind a flag/profile routing rule.
   - Define fallback provider/model profile behavior.

## Outputs
- Updated: `.ai/llm-config/registry/providers.yaml`
- Updated (if needed): `.ai/llm-config/registry/config_keys.yaml`
- Adapter implementation + tests + telemetry

## Required verification
- `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs` (if any new key)
- Repo tests for the adapter layer (minimum: contract tests)

## Optional deep references
- Architecture: `reference/docs/architecture.md`
- Provider onboarding: `reference/docs/provider-onboarding.md`
- Observability & cost: `reference/docs/observability-cost.md`
- Release/regression: `reference/docs/release-regression.md`
