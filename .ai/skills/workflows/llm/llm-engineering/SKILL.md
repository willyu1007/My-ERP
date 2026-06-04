---
name: llm-engineering
description: Entry workflow for LLM engineering tasks (provider integration, calling wrapper, routing profiles, prompt templates, cost/telemetry, credentials/config keys). Routes to one procedure and enforces required verification.
---

# LLM Engineering (workflow)

## Operating mode (token-efficient)
- Treat the llm-engineering skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Use `.ai/llm-config/registry/*` as the SSOT for identifiers and allowed config keys.

## Routing (pick one procedure)

| Task | Open the procedure |
|---|---|
| Add / integrate a provider | `reference/procedures/add-provider.md` |
| Standardize or introduce a single calling wrapper | `reference/procedures/standardize-calling-wrapper.md` |
| Add / change model routing profiles | `reference/procedures/add-model-profile.md` |
| Add / change prompt templates (versioned) | `reference/procedures/update-prompt-template.md` |
| Release / major change review | `reference/procedures/release-check.md` |

## Examples (end-to-end)
Open **one** example only if you need a concrete template.

| Example | Open |
|---|---|
| Add a provider (OpenAI-style) | `reference/examples/e2e-01-add-provider-openai.md` |
| Update a prompt template (versioned) | `reference/examples/e2e-02-update-prompt-template.md` |
| Add a model routing profile | `reference/examples/e2e-03-add-model-profile.md` |

## Shared non-negotiables (apply to all procedures)
1) **No secrets in repo**
   - Use non-secret references (e.g., `credential_ref`).

2) **Registry-first configuration**
   - Never introduce new LLM env/config keys ad-hoc.
   - Register in `.ai/llm-config/registry/config_keys.yaml`.

3) **Single calling surface**
   - Feature code must not import provider SDKs directly.
   - Route all calls through one wrapper/gateway client.

4) **Versioned prompts**
   - Prompt references are `prompt_template_id` + immutable `version`.

## Minimal inputs you should capture before changing code
- Intended user-facing capability (what feature needs LLM?)
- Required modalities/APIs (chat, embeddings, streaming)
- Routing intent (quality vs cost vs latency)
- Credential strategy (`credential_ref`; no secrets)
- Budget constraints (tokens/$) and telemetry fields

## Verification
- If you changed **skills**:
  - `node .ai/scripts/lint-skills.mjs --strict`
  - `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`

- Registry sanity (recommended; run before release):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs`
  - In real (non-template) repos, run with `--strict` in CI.

- If you changed **LLM config/env keys** (or introduced new ones):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`

- If the host repo has tests/lint:
  - run the smallest relevant test suite for the modified area (wrapper/adapter/registry).

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not add MCP-related content (out of scope for this workflow).
- Do not create new top-level directories for LLM work; keep assets under existing conventions (`.ai/`, `.system/`).
- Do not add provider SDK calls directly into product/feature code.
