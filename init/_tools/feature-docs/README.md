# Feature Documentation

This directory contains human-facing docs for optional **features** that can be materialized during init **Stage C** (`apply`).

This is the **addon** edition of the template. It does not use a top-level `addons/` directory; Feature assets are integrated under `.ai/`:

- Templates: usually `.ai/skills/features/<feature-id>/templates/` (some features source templates from nested skills; for database modes, see `.ai/skills/features/database/**/templates/`)
- Control scripts:
  - Repo-level Node controllers: `.ai/scripts/ctl-*.mjs` (and other repo controllers like `sync-skills.mjs`)
  - Feature-local tools: `.ai/skills/features/**/scripts/*` (Node `.mjs` and/or Python `.py`)
- Feature flags/state: `.ai/project/state.json` (via `.ai/scripts/ctl-project-state.mjs`)

## Available features

| Feature ID | Blueprint toggle | Control script | Documentation |
|------------|------------------|----------------|---------------|
| `context-awareness` | `features.contextAwareness` | `.ai/skills/features/context-awareness/scripts/ctl-context.mjs` | [context-awareness.md](context-awareness.md) |
| `database` | `features.database` (requires `db.ssot != none` and `features.contextAwareness=true`) | `.ai/scripts/ctl-db-ssot.mjs` (public status/sync; Stage C also runs mode-specific init tools) | [database.md](database.md) |
| `ui` | `features.ui` | `.ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py` | [ui.md](ui.md) |
| `environment` | `features.environment` | `.ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py` | [environment.md](environment.md) |
| `iac` | `iac.tool` (or `features.iac`) | `.ai/skills/features/iac/scripts/ctl-iac.mjs` | [iac.md](iac.md) |
| `packaging` | `features.packaging` | `.ai/skills/features/packaging/scripts/ctl-packaging.mjs` | [packaging.md](packaging.md) |
| `deployment` | `features.deployment` | `.ai/skills/features/deployment/scripts/ctl-deploy.mjs` | [deployment.md](deployment.md) |
| `release` | `features.release` | `.ai/skills/features/release/scripts/ctl-release.mjs` | [release.md](release.md) |
| `ci` | `features.ci` (requires `ci.provider`) | `.ai/skills/features/ci/scripts/ctl-ci.mjs` | [ci.md](ci.md) |
| `observability` | `features.observability` (requires `features.contextAwareness=true`) | `.ai/skills/features/observability/scripts/ctl-observability.mjs` | [observability.md](observability.md) |

## How to decide (Stage B)

- You MUST set `features.<id>: true` to install a feature during Stage C.
- **Exception (IaC)**: setting `iac.tool` to `ros` or `terraform` also enables the IaC feature (no vendor-specific assumptions).
- Blueprint config sections (`db.*`, `deploy.*`, `packaging.*`, `release.*`, `observability.*`, `context.*`) influence recommendations but do not install by themselves.
- Use the pipeline to compute recommendations:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
```

Common dependency checks (enforced by `validate`):

- `features.database=true` requires `db.ssot != none` and `features.contextAwareness=true`.
- `features.observability=true` requires `features.contextAwareness=true`.

## Enabling features

In `init/_work/project-blueprint.json`:

```json
{
  "db": { "enabled": true, "ssot": "database", "kind": "postgres", "environments": ["dev", "staging", "prod"] },
  "features": {
    "contextAwareness": true,
    "database": true,
    "ui": true,
    "environment": true,
    "packaging": true,
    "deployment": true,
    "release": true,
    "observability": true
  }
}
```

Then run Stage C apply:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both
```

## Materialization semantics (Stage C)

By default, Stage C is **non-destructive**:

- Templates are copied into the repo using **copy-if-missing** (existing files are kept).
- Each enabled feature runs its control scripts (Node and/or Python, depending on the feature).
- Disabling a feature later does NOT uninstall previously created files (manual removal only).

Useful flags:

- `--force-features`: overwrite existing files when copying templates
- `--verify-features`: run the feature verify step after init (when available)
- `--non-blocking-features`: continue despite feature errors (default is fail-fast)
