# Feature: CI

## Conclusions (read first)

- Installs a practical CI baseline for **GitHub Actions** or **GitLab CI**
- Stage C installs **CI only** (no delivery workflow by default)
- Delivery is **explicit opt-in** (enabled via `ctl-ci add-delivery`)

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "features": {
    "ci": true
  },
  "ci": {
    "provider": "github"
  }
}
```

Set `"provider": "gitlab"` to install GitLab CI instead.

## What Stage C `apply` does

When enabled, Stage C:

1) Runs the CI controller:

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider <github|gitlab> --repo-root .
```

2) Materializes (copy-if-missing):
- GitHub Actions: `.github/workflows/ci.yml`
- GitLab CI: `.gitlab-ci.yml`
- CI metadata: `ci/**` (`ci/config.json`, `ci/handbook/`, etc.)

3) Uses shared check entrypoint in provider templates:
- `node .ai/skills/features/ci/scripts/ci-verify.mjs --suite <...>`

4) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs verify --repo-root .
```

## Delivery (explicit opt-in)

Stage C does **not** install delivery workflows.

Enable delivery explicitly (method A):

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github --repo-root .
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab --repo-root .
```

## Acceptance

- `node .ai/skills/features/ci/scripts/ctl-ci.mjs --help` documents `init`, `add-delivery`, and `verify`
- `node .ai/skills/features/ci/scripts/ci-verify.mjs --help` documents shared CI check targets
- Stage C installs exactly one CI provider workflow based on `ci.provider`
