# `.ai/` (LLM-facing)

## Purpose

`.ai/` stores **LLM-facing** assets for repo governance:
- Skills (SSOT)
- Maintenance scripts (lint/sync/checks)
- LLM engineering governance entry points

## Non-negotiables

- **SSOT**: edit skills only under `.ai/skills/`.
- **Generated stubs**: do not edit `.codex/skills/` or `.claude/skills/` directly. Regenerate via sync.
- **Progressive disclosure**: do not recursively enumerate `.ai/` to "discover" content.

## Routing

- If the task is **project-level progress governance** (project hub, task registry, progress aggregation, mapping tasks to Feature/Requirement/Milestone):
  - Open: `.ai/project/AGENTS.md`
  - Use workflows: `project-orchestrator`, `project-status-reporter`, `project-sync-lint`
- If the task is **LLM engineering** (provider integration, calling wrappers, profiles, prompts, cost/telemetry, credentials/config keys):
  - Open: `.ai/llm-config/AGENTS.md`
  - Invoke workflow skill: `llm-engineering`
- If the task is **skill authoring/maintenance**:
  - Open: `.ai/skills/standards/documentation-guidelines/SKILL.md`
  - Run:
    - `node .ai/scripts/lint-skills.mjs --strict`
    - `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`
- If the user asks to **sync skill stubs** (sync skills / sync stubs):
  - Use the repo selection in `.ai/skills/_meta/sync-manifest.json` via `--scope current`
  - Run: `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`
- If the task is **dev-docs task documentation** (long-running work, handoff, context recovery):
  - Open: `dev-docs/AGENTS.md`
  - Use workflows: `create-dev-docs-plan`, `update-dev-docs-for-handoff`

## Context loading rules (token-efficient)

AI/LLM MUST:
- Read only the **single** file it is routed to.
- Open additional files only when an already-opened doc provides an explicit path.

AI/LLM MUST NOT:
- Run recursive listing/grep over `.ai/` (e.g., `tree .ai`, `rg --files .ai`).

## Verification (repo maintenance)

- Lint skills: `node .ai/scripts/lint-skills.mjs --strict`
- Sync stubs: `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`
- Delete skills: `node .ai/scripts/sync-skills.mjs --delete-skills "<csv>" --yes` (preview with `--dry-run`)
- LLM config key gate: `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
- LLM registry sanity: `node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs`
