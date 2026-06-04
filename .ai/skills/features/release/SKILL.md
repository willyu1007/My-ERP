---
name: release
description: Enable and operate the Release feature (release checklists + changelog conventions + ctl-release) for consistent versioning.
---

# Release Feature

## Intent

Standardize how the project versions, changelogs, and release execution are tracked.

## What gets enabled

When enabled, this feature materializes:

- `release/**` (checklists, config, templates)
- `release/CHANGELOG.md` (seeded from `release/changelog-template.md` if missing)
- `release/.releaserc.json.template` (seed for semantic-release or similar tools)

Controller script (provided by the template SSOT):

- `node .ai/skills/features/release/scripts/ctl-release.mjs` — manage release configuration and checklists

## How to enable

1. Copy templates from:
   - `.ai/skills/features/release/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/skills/features/release/scripts/ctl-release.mjs init
node .ai/skills/features/release/scripts/ctl-release.mjs verify
```

Optional (recommended for LLM routing): record the flag in project state:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.release true
```

## Operating rules

- Releases are **human-executed** unless CI automation is explicitly configured.
- Keep release decisions and checklists under `release/handbook/`.

## Verification

```bash
node .ai/skills/features/release/scripts/ctl-release.mjs verify
```

## Boundaries

- Release actions (tagging/publishing) are human-executed unless CI is explicitly configured.
- Do not store credentials/tokens in repo; keep release metadata/config non-secret.
- Keep changes within the declared blast radius (`release/**`, `release/.releaserc.json.template`).
