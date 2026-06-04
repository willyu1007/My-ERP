# AI-Friendly Repository Template (Addon)

This repository is a starter template for building **LLM-first** codebases with:

- **Single Source of Truth (SSOT)** skills under `.ai/skills/`
- Generated provider wrappers under `.codex/skills/` and `.claude/skills/`
- A **verifiable, 3-stage initialization pipeline** under `init/`
- An **addon-style Feature system** that injects project lifecycle capabilities on demand during Stage C

## Quick start

| For | Action |
|-----|--------|
| **AI Assistants** | Read `init/AGENTS.md` and run the Stage A/B/C pipeline |
| **Humans** | Read `init/README.md` and follow the steps |

## Repository layout (high-level)

```
init/                         # Project bootstrap kit (Stage A/B/C)
  README.md
  AGENTS.md
  _tools/                     # Shipped init tools/docs (skills, stages, feature docs)
  _work/                      # Runtime artifacts (created during init)

.ai/
  skills/                     # SSOT skills (edit here only)
  scripts/                    # `sync-skills.mjs` (generates provider wrappers)

.codex/skills/                # Generated wrappers (DO NOT EDIT)
.claude/skills/               # Generated wrappers (DO NOT EDIT)

dev-docs/                     # Complex task documentation
```

## Key rules (SSOT + wrappers)

- **MUST** edit skills only in `.ai/skills/`.
- **MUST NOT** edit `.codex/skills/` or `.claude/skills/` directly.
- After changing `.ai/skills/`, regenerate wrappers:

```bash
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```

## Pointers

- Initialization: `init/README.md`
- AI assistant rules: `AGENTS.md` and `init/AGENTS.md`
- Skill authoring standard: `.ai/skills/standards/documentation-guidelines/SKILL.md`
- Documentation standard: `.ai/skills/standards/documentation-guidelines/SKILL.md`


## Optional features (addon template)

This is the **addon** edition of the template. It does not use a top-level `addons/` directory; optional capabilities are materialized as Features during init **Stage C** based on `init/_work/project-blueprint.json`:

- Feature toggles: `features.*` (see `init/_tools/feature-docs/README.md`)
- Assets live under `.ai/skills/features/**/templates` and `.ai/scripts/ctl-*.mjs`
- Stage C `apply` copies templates (copy-if-missing by default) and runs `ctl-*.mjs init`
- Feature set covers project lifecycle domains such as context, database, UI, environment, IaC, packaging, deployment, release, CI, and observability

Example:

```json
{
  "features": { "contextAwareness": true },
  "context": { "mode": "contract" }
}
```

`context.*` is configuration only and does not enable the feature by itself.
