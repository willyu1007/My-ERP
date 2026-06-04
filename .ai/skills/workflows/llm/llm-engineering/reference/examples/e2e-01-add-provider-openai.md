# E2E Example 01 — Add a provider (OpenAI-style) end-to-end

## Scenario
You need to integrate a new LLM provider behind a single calling surface, using **implicit credentials** and **registry-first** identifiers.

- User request (example): "Add OpenAI as an LLM provider for code generation. Do not expose API keys to feature code."
- Chosen workflow: `../procedures/add-provider.md`

## Inputs you must have
- `provider_id`: `openai`
- Auth strategy: API key resolved via `credential_ref` (no secrets in repo)
- APIs needed: chat (streaming optional)
- Rollout: start with canary (profile-gated)

## End-to-end steps
1) **Register provider (SSOT)**
   - Edit: `.ai/llm-config/registry/providers.yaml`
   - Add an entry like:

```yaml
- provider_id: openai
  display_name: OpenAI
  auth:
    type: api_key
    credential_ref_required: true
  capabilities: [chat, embeddings]
  defaults:
    timeout_ms: 60000
    max_retries: 1
    supports_streaming: true
```

2) **Register any new in-scope keys (if you introduce them)**
   - Edit: `.ai/llm-config/registry/config_keys.yaml`
   - Example keys (only if your wrapper needs them):
     - `OPENAI_API_BASE`
     - `OPENAI_ORG_ID`

3) **Implement adapter in your project (repo-specific)**
   - Create/extend your **single calling surface**:
     - `LLMClient` / `LLMGateway` / `llm_wrapper`
   - Add `OpenAIAdapter` inside that surface (feature code must not import SDKs).
   - Requirements:
     - canonical request envelope → provider request
     - normalized response + normalized errors
     - telemetry fields: `provider_id`, `model_id`, `profile_id`, `prompt_template_id`, `prompt_version`, `tenant_id`, `user_id`, `trace_id`

4) **Add a profile that can route to the new provider (optional but recommended)**
   - Edit: `.ai/llm-config/registry/model_profiles.yaml`
   - Example (canary profile):

```yaml
- profile_id: codegen_canary
  intent: code_generation
  candidates:
    - provider_id: openai
      model_id: gpt-4.1-mini
      weight: 100
```

5) **Add/upgrade a prompt template (optional)**
   - Edit: `.ai/llm-config/registry/prompt_templates.yaml`
   - Use `(prompt_template_id, version)` (immutable versioning).

## Verification
Run from repo root:

- Registry sanity (recommended):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs`
- Config key gate (required if any new in-scope key was introduced):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
- Run the smallest adapter/wrapper test suite available in your repo.

## Expected outputs
- Updated SSOT registries under `.ai/llm-config/registry/*`
- New adapter implementation under your single calling surface
- Contract tests + telemetry

