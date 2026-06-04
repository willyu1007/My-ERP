# LLM Engineering (NO MCP)

## Scope
- In scope: LLM provider integration, calling wrappers/gateway clients, model routing profiles, prompt templates, cost/telemetry, credentials/config keys.
- Out of scope: MCP servers/tools.

## Entry point (progressive disclosure)

**Skill:** `llm-engineering`

**Procedures:** `.ai/skills/workflows/llm/llm-engineering/reference/procedures/`

Routing (open exactly one):
- Add / integrate a provider: `.ai/skills/workflows/llm/llm-engineering/reference/procedures/add-provider.md`
- Standardize a single calling wrapper: `.ai/skills/workflows/llm/llm-engineering/reference/procedures/standardize-calling-wrapper.md`
- Add / change model routing profiles: `.ai/skills/workflows/llm/llm-engineering/reference/procedures/add-model-profile.md`
- Add / change prompt templates (versioned): `.ai/skills/workflows/llm/llm-engineering/reference/procedures/update-prompt-template.md`
- Release / major change review: `.ai/skills/workflows/llm/llm-engineering/reference/procedures/release-check.md`

## SSOT (registries)
These files are the **single source of truth** for stable identifiers and allowed configuration keys.

- Providers: `.ai/llm-config/registry/providers.yaml`
- Model profiles: `.ai/llm-config/registry/model_profiles.yaml`
- Prompt templates: `.ai/llm-config/registry/prompt_templates.yaml`
- Config/env keys: `.ai/llm-config/registry/config_keys.yaml`

## Non-negotiables
1) **Registry-first config**
   - Never introduce new LLM env/config keys ad-hoc.
   - Register first in `.ai/llm-config/registry/config_keys.yaml`.
   - Verify:
     - `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
     - `node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs`

2) **No secrets in repo**
   - Store only non-secret references (e.g., `credential_ref`).

3) **Single calling surface**
   - Product/feature code must call LLM via one wrapper/gateway surface.
   - Do not import provider SDKs directly in feature code.

4) **Versioned prompts**
   - Prompts are referenced by `prompt_template_id` + immutable `version`.

## Canonical identifiers (do not rename ad-hoc)
- `provider_id`: stable provider key (kebab-case).
- `model_id`: provider-specific model name/id.
- `model_profile` / `profile_id`: business intent label mapping to candidates.
- `credential_ref`: non-secret pointer to secrets manager.
- `prompt_template_id` + `version`: stable prompt reference; versions immutable.
- `execution_context`: request-scoped context (tenant/user/roles/budget/trace).
