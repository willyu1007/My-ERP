## Context Awareness (Feature)

If `docs/context/` exists:

- AI/LLM MUST treat `docs/context/AGENTS.md` as the authoritative entry point for project context (with `docs/context/INDEX.md` as supplementary reference).
- AI/LLM MUST NOT "scan the repo" to infer APIs/DB/flows when context artifacts are available.
- AI/LLM MUST update `docs/context/` only via `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs`.
  - Do NOT directly edit `docs/context/registry.json` by hand.
  - After any context change, run: `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch` and `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`.

Pack switching:

- AI/LLM MUST NOT edit `.ai/skills/_meta/sync-manifest.json` directly.
- AI/LLM MUST use: `node .ai/skills/_meta/ctl-skill-packs.mjs enable-pack|disable-pack|sync ...`.

Project state:

- AI/LLM MUST treat `.ai/project/state.json` as the project "stage/state" SSOT.
- AI/LLM MUST use: `node .ai/scripts/ctl-project-state.mjs` to change it.
