# Business Process Artifacts (BPMN)

## Purpose
Store BPMN 2.0 process definitions under `docs/context/process/` (LLM-visible contracts).

## Rules (MUST)

- Each `.bpmn` file MUST be registered in `docs/context/registry.json` (use `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-artifact ...`).
- After editing any `.bpmn`, run:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch`
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## Progressive disclosure (LLM)
- Prefer reading `docs/context/registry.json` first, then open only the specific `.bpmn` files needed.
