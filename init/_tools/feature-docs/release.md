# Feature: release

## Conclusions (read first)

- Provides release/versioning conventions and templates under `release/`
- Adds release tooling templates (e.g. `release/.releaserc.json.template`)
- Designed to be CI-friendly but provider-agnostic

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "features": {
    "release": true
  },
  "release": {
    "enabled": true,
    "strategy": "semantic",
    "changelog": true
  }
}
```

## What Stage C `apply` does

When enabled, Stage C:

1) Copies templates from:
- `.ai/skills/features/release/templates/`

2) Runs the controller:

```bash
node .ai/skills/features/release/scripts/ctl-release.mjs init --repo-root .
```

3) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/release/scripts/ctl-release.mjs verify --repo-root .
```

## Key outputs

- `release/**`
- `release/.releaserc.json.template`
- `release/CHANGELOG.md` (seeded from `release/changelog-template.md` if missing)
