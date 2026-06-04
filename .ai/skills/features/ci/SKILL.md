---
name: ci
description: Enable and operate the CI feature (GitHub Actions / GitLab CI) with repeatable templates, artifact conventions, and opt-in delivery enablement.
---

# CI Feature

## Intent

Provide a practical, repo-embedded CI baseline:
- deterministic test/build commands (by convention)
- consistent artifacts upload and retention defaults
- provider templates for GitHub Actions and GitLab CI

Delivery (release/packaging/deploy automation) is **opt-in** and is not installed by default.

## What gets enabled

When enabled, this feature materializes:

- CI metadata directory:
  - `ci/AGENTS.md`
  - `ci/config.json`
  - `ci/handbook/`
- Provider workflow file (copy-if-missing):
  - GitHub Actions: `.github/workflows/ci.yml`
  - GitLab CI: `.gitlab-ci.yml`

Provider skills (for workflow customization and troubleshooting):

- `.ai/skills/features/ci/github-actions-ci/`
- `.ai/skills/features/ci/gitlab-ci/`

Controller script (feature-local):

- `node .ai/skills/features/ci/scripts/ctl-ci.mjs`
- `node .ai/skills/features/ci/scripts/ci-verify.mjs` (shared CI check entrypoint used by provider templates)

## How to enable

Run:

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider github --repo-root .
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider gitlab --repo-root .
```

Optional (recommended for LLM routing): record the flag in project state:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.ci true
```

## Delivery explicit enable (opt-in)

Delivery is enabled explicitly (method A) via:

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github --repo-root .
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab --repo-root .
```

## Boundaries

- Do not store secrets in repo; CI secrets must come from the CI platform secret store.
- Keep CI PR/MR gating fast; move flaky/heavy suites to scheduled/manual triggers.
- Do not make deploy/release actions automatic unless the repo explicitly opts in and documents credentials, approvals, and rollback.

## Verification

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs --help
node .ai/skills/features/ci/scripts/ci-verify.mjs --help

# Dry-run install (no writes)
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider github --repo-root . --dry-run
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider gitlab --repo-root . --dry-run

# Dry-run delivery opt-in (no writes)
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github --repo-root . --dry-run
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab --repo-root . --dry-run
```
