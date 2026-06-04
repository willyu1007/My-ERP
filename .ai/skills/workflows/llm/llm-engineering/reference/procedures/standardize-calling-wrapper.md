# Procedure: Standardize / introduce a single LLM calling wrapper

**Base (references):** `.ai/skills/workflows/llm/llm-engineering/reference/`

## Goal
Create (or refactor) a **single calling surface** for LLM usage so feature code is provider-agnostic and governance (routing, retries, telemetry, budgets, prompt versioning) is enforced centrally.

## Inputs (collect before edits)
- Current call sites (where provider SDKs are used directly)
- Required APIs (chat/embeddings/streaming)
- Required request context (`execution_context` fields)
- Target routing mechanism (direct model vs `model_profile`)

## Steps
1) **Define the canonical request envelope** (do not overfit to one provider)
   - Required fields:
     - `execution_context` (tenant/user/roles/budget/trace)
     - `model_profile` (preferred) OR explicit `provider_id` + `model_id`
     - `prompt_template_id` + `version` (immutable)
     - user input (message/content)
     - optional: tool/function schema, streaming flag

2) **Centralize routing and defaults**
   - Routing must be driven by SSOT registries:
     - `.ai/llm-config/registry/model_profiles.yaml`
     - `.ai/llm-config/registry/providers.yaml`
   - Defaults belong in the wrapper (timeouts, retry policy, safety limits), not in feature code.

3) **Normalize errors**
   - Map provider-specific errors to a small canonical taxonomy:
     - `AuthError`, `RateLimitError`, `TimeoutError`, `TransientError`, `InvalidRequestError`, `UpstreamError`.

4) **Enforce budgets**
   - Apply per-request budgets (tokens / $ / time) using `execution_context`.
   - Make “budget exceeded” a first-class error.

5) **Instrument telemetry**
   - Emit consistent trace/log fields for every call.
   - Attribute cost to tenant/user/profile/prompt version.

6) **Migrate call sites**
   - Replace direct provider SDK usage with the wrapper.
   - Keep blast radius small: migrate one feature area at a time.

7) **Regression safety**
   - Add golden tests or snapshot-style tests for the wrapper’s canonical request/response mapping.
   - For streaming: add at least one streaming smoke test.

## Outputs
- A single wrapper/gateway API for all LLM calls
- Updated routing/profile and prompt usage in feature code
- Canonical error mapping and telemetry

## Required verification
- If new config/env keys are introduced:
  - update `.ai/llm-config/registry/config_keys.yaml`
  - run `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
- Run the smallest relevant test suite for the wrapper layer

## Optional deep references
- Runtime calling: `reference/docs/runtime-calling.md`
- Config registry: `reference/docs/config-registry.md`
- Observability & cost: `reference/docs/observability-cost.md`
- Architecture: `reference/docs/architecture.md`
