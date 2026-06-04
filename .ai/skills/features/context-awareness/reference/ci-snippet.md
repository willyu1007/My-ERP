## CI snippet (generic)

Add a step in your CI pipeline that runs:

- `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`
- `node .ai/scripts/ctl-project-state.mjs verify`

This enforces that:
- `docs/context/registry.json` matches the current artifacts (checksums)
- the project state file is schema-valid

If you also want to enforce skills wrapper sync, add:
- `node .ai/skills/_meta/ctl-skill-packs.mjs sync --providers both`
