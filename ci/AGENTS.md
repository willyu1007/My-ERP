# CI Configuration (LLM-first)

## Commands

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs init
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider github
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider gitlab
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab
node .ai/skills/features/ci/scripts/ctl-ci.mjs verify
node .ai/skills/features/ci/scripts/ctl-ci.mjs status
```

## Guidelines

- Track CI metadata in `ci/config.json`.
- Edit provider files directly (e.g., `.github/workflows/`, `.gitlab-ci.yml`).
