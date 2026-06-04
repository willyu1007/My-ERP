# E2E Example 02 — Update a prompt template (versioned) end-to-end

## Scenario
You need to change a production prompt without breaking callers, and you want prompt changes to be reviewable and rollbackable.

- User request (example): "Add `repo_style` and `language` variables to the codegen prompt, keep old behavior available."
- Chosen workflow: `../procedures/update-prompt-template.md`

## Inputs you must have
- `prompt_template_id`: `codegen`
- New version: `2` (immutable; do not edit v1)
- Variable schema additions:
  - `repo_style`: enum (e.g., `clean`, `enterprise`)
  - `language`: enum (e.g., `ts`, `py`, `go`)

## End-to-end steps
1) **Add a new prompt version (SSOT)**
   - Edit: `.ai/llm-config/registry/prompt_templates.yaml`
   - Append a new entry (do not modify old versions):

```yaml
- prompt_template_id: codegen
  version: 2
  description: Code generation with repo-aware style controls.
  variables_schema:
    type: object
    properties:
      repo_style:
        type: string
        enum: [clean, enterprise]
      language:
        type: string
        enum: [ts, py, go]
    required: [repo_style, language]
  notes:
    - Keep output limited to changed files.
```

2) **Update your calling wrapper to reference the new version**
   - Update only the wrapper/gateway layer (repo-specific).
   - Feature code should keep calling by stable ID (or a profile that maps to the new prompt version).

3) **If you introduce new config keys (rare for prompt changes), register them**
   - Edit: `.ai/llm-config/registry/config_keys.yaml`

4) **Add regression coverage**
   - Add a minimal golden set:
     - v1 outputs remain stable
     - v2 outputs follow the new variable schema
   - Add a rollback note: "switch callers back to `version: 1`"

## Verification
Run from repo root:

- Registry sanity (recommended):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs`
- Config key gate (only if new in-scope keys were introduced):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
- Run the smallest prompt regression suite available.

## Expected outputs
- A new immutable prompt entry: `(prompt_template_id=codegen, version=2)`
- Regression evidence + rollback plan

