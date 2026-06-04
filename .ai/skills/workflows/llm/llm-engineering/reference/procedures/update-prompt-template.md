# Procedure: Add / change a prompt template (versioned)

**Base (references):** `.ai/skills/workflows/llm/llm-engineering/reference/`

## Goal
Update prompts without drift by using stable IDs and immutable versions.

## Inputs (collect before edits)
- Template intent (what outcome the prompt is optimizing)
- Variables needed (with types and allowed ranges)
- Target profile/model (if needed)
- Regression set (examples expected to improve and expected not to regress)

## Steps
1) **Select template ID and versioning strategy**
   - `prompt_template_id` is stable.
   - `version` is immutable. Never edit a released version in place.

2) **Register the new version (SSOT)**
   - Edit: `.ai/llm-config/registry/prompt_templates.yaml`
   - Add:
     - `prompt_template_id`
     - new `version`
     - variable schema (names + types)
     - compatibility notes

3) **Update the calling wrapper / call sites**
   - Feature code references: `prompt_template_id` + `version`.
   - Do not inline large prompts in feature code.

4) **Guardrails**
   - Validate required variables at runtime (fail fast with clear error).
   - Avoid introducing new env/config keys unless necessary; if you do:
     - register in `.ai/llm-config/registry/config_keys.yaml`
     - run `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`

5) **Evaluation / regression**
   - Add at least a small regression set.
   - Capture cost/latency deltas and failure modes.

## Outputs
- Updated: `.ai/llm-config/registry/prompt_templates.yaml`
- Updated wrapper/call sites to use the new immutable version
- Regression artifacts (tests/eval notes)

## Required verification
- If new keys: `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
- Run prompt regression (minimum: golden tests / snapshots)

## Optional deep references
- Prompt governance: `reference/docs/prompt-governance.md`
- Runtime calling: `reference/docs/runtime-calling.md`
- Release/regression: `reference/docs/release-regression.md`
