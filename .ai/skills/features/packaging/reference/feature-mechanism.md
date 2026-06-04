# Packaging Feature (Optional)

## Conclusions (read first)

- This feature provides **container and artifact packaging** infrastructure.
- Manages Dockerfiles, build scripts, and artifact registries.
- AI proposes packaging configurations; humans execute builds.

## What this feature writes (blast radius)

New files/directories (created if missing):

- `ops/packaging/` (packaging root)
  - `ops/packaging/AGENTS.md` (LLM guidance)
  - `ops/packaging/services/` (service Dockerfiles)
  - `ops/packaging/jobs/` (job/batch Dockerfiles)
  - `ops/packaging/apps/` (app Dockerfiles)
  - `ops/packaging/templates/` (Dockerfile templates)
  - `ops/packaging/scripts/` (build scripts)
  - `ops/packaging/handbook/` (packaging plans)
- `docs/packaging/registry.json` (artifact registry)
- `.ai/skills/features/packaging/scripts/ctl-packaging.mjs` (packaging management)
- `.ai/skills/features/packaging/` (feature documentation)

## Install

### Install manually

1. Materialize templates into the repository root:
   - From: `.ai/skills/features/packaging/templates/`
   - To: repo root
   - Copy-if-missing (non-destructive merge)
2. Initialize packaging:
   ```bash
   node .ai/skills/features/packaging/scripts/ctl-packaging.mjs init
   ```

Optional (recommended for LLM routing): record the flag in project state:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.packaging true
```

## Usage

### Register Targets

```bash
# Register a service
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-service --id api --module apps/backend

# Register a job
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-job --id cron-task --module jobs/cron

# List all targets
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs list
```

### Build Artifacts

```bash
# Build a specific target
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs build --target api --tag v1.0.0

# Build all targets
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs build-all --tag v1.0.0

# Verify packaging configuration
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs verify
```

## Artifact Registry

`docs/packaging/registry.json` tracks all packaging targets:

```json
{
  "targets": [
    {
      "id": "api",
      "type": "service",
      "module": "apps/backend",
      "dockerfile": "ops/packaging/services/api.Dockerfile"
    }
  ]
}
```

## Dockerfile Templates

Templates in `ops/packaging/templates/`:

- `Dockerfile.node` - Node.js applications
- `Dockerfile.python` - Python applications
- `Dockerfile.go` - Go applications

## Verification

```bash
# Verify packaging configuration
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs verify

# List registered targets
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs list
```

## Rollback / Uninstall

Delete these paths:

- `ops/packaging/`
- `docs/packaging/`
- `.ai/skills/features/packaging/scripts/ctl-packaging.mjs`
- `.ai/skills/features/packaging/`
