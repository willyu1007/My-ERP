# Context Awareness Feature (Optional)

## Conclusions (read first)

- The feature installs a **stable, verifiable project context layer** under `docs/context/` (API, DB schema mapping, BPMN, and additional artifacts).
- The feature also provides **environment configuration management** under `docs/context/config/` and `config/environments/`.
- The feature provides **project-level scripts** that MUST be used to change the context:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs` (context artifacts + registry + environments)
  - `node .ai/scripts/ctl-project-state.mjs` (project state/config)
  - `node .ai/skills/_meta/ctl-skill-packs.mjs` (skills pack switching + wrapper sync)
- The goal is to make an LLM "context-aware" without relying on ad-hoc folder scans:
  - The LLM reads `docs/context/AGENTS.md` as the authoritative entry point, with `docs/context/INDEX.md` and `docs/context/registry.json` as supplementary references.
  - Environment constraints are in `docs/context/config/environment-registry.json`.
  - CI can run `ctl-context verify --strict` to enforce "changes go through scripts".

## What this feature writes (blast radius)

New files/directories (created if missing):

- `docs/context/**` (context artifacts and registry)
- `docs/context/AGENTS.md` (LLM routing entrypoint — progressive loading protocol)
- `docs/context/glossary.json` + `glossary.schema.json` (domain glossary)
- `docs/context/architecture-principles.md` (cross-cutting constraints)
- `docs/context/config/**` (environment registry)
- `.ai/skills/features/context-awareness/**` (documentation for this feature)
- `config/environments/**` (environment config templates)
- `.ai/skills/features/context-awareness/scripts/ctl-context.mjs`
- `.ai/scripts/ctl-project-state.mjs`
- `.ai/skills/_meta/ctl-skill-packs.mjs` (pack controller)
- `.ai/project/{state.json,state.schema.json}`
- `.ai/skills/_meta/packs/context-core.json` (pack definition)


## Install

To install (without relying on any bootstrap pipeline):

1. Copy the feature templates into the repository root (merge, copy-if-missing):
   - Source: `.ai/skills/features/context-awareness/templates/`
   - Destination: repo root
2. Initialize (idempotent):

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.contextAwareness true
node .ai/scripts/ctl-project-state.mjs set context.enabled true
node .ai/scripts/ctl-project-state.mjs set-context-mode contract
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs init
```

3. After editing any context artifacts, refresh checksums:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch
```

4. (Optional) Enable the `context-core` pack and sync wrappers:

```bash
node .ai/skills/_meta/ctl-skill-packs.mjs enable-pack context-core --providers both
```


## Environment Configuration

The feature includes environment configuration management:

### Environment Registry

`docs/context/config/environment-registry.json` defines:
- Available environments (dev, staging, prod, etc.)
- Database access policies per environment
- Deployment permissions
- Secrets source information

### Config Templates

`config/environments/` contains YAML templates:
- `dev.yaml.template` - Development configuration
- `staging.yaml.template` - Staging configuration
- `prod.yaml.template` - Production configuration

Copy templates to actual config files (remove `.template` suffix) and fill in values.
**Never commit actual secrets to version control.**

### Environment Commands

```bash
# Add a new environment
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-env --id qa --description "QA environment"

# List all environments
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs list-envs

# Verify environment configuration
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify-config --env staging
```

## Glossary Commands

```bash
# Add a term
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-term --term "tenant" --definition "An isolated customer organization" --scope global --aliases "organization,org"

# Remove a term
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs remove-term --term "tenant"

# List all terms
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs list-terms --format json
```

## Artifact Commands

```bash
# Add an artifact
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-artifact --id my-api --type openapi --path docs/context/api/my-api.yaml

# Remove an artifact
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs remove-artifact --id old-api

# Update checksums after editing artifacts
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch

# List all artifacts
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs list
```

## Verification

- Context layer exists and is consistent:
  ```bash
  node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
  ```
- Environment configuration is valid:
  ```bash
  node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify-config
  ```
- Project state is valid:
  ```bash
  node .ai/scripts/ctl-project-state.mjs verify
  ```
- Skills wrappers are synced (if you enabled packs):
  ```bash
  node .ai/skills/_meta/ctl-skill-packs.mjs sync --providers both
  ```

## Rollback / Uninstall

Delete these paths (if you want a clean uninstall):

- `docs/context/`
- `.ai/skills/features/context-awareness/`
- `config/environments/`
- `.ai/skills/features/context-awareness/scripts/ctl-context.mjs`
- `.ai/scripts/ctl-project-state.mjs`
- `.ai/skills/_meta/ctl-skill-packs.mjs`
- `.ai/project/`
- `.ai/skills/_meta/packs/context-core.json`

Then re-sync wrappers:
```bash
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode update
```
