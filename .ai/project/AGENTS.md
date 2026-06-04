# AGENTS (Project Governance)

Entry point for AI agents working with **project-level** governance in the repository.

## Quick start

1) Initialize the project hub (idempotent; creates `.ai/project/main/` from templates):
```bash
node .ai/scripts/ctl-project-governance.mjs init --project main
```

2) Query tasks (LLM-friendly JSON lines; works even if hub is missing):
```bash
node .ai/scripts/ctl-project-governance.mjs query --project main --text "sync"
node .ai/scripts/ctl-project-governance.mjs query --project main --status in-progress
node .ai/scripts/ctl-project-governance.mjs query --project main --id T-001
```

3) Run lint (CI-friendly; warnings do not fail the job):
```bash
node .ai/scripts/ctl-project-governance.mjs lint --check --project main
```

4) Sync/fix drift (manual):
```bash
node .ai/scripts/ctl-project-governance.mjs sync --apply --project main
```

Optional: append sync-detected events to changelog (append-only):
```bash
node .ai/scripts/ctl-project-governance.mjs sync --apply --project main --changelog
```

5) (Optional) Install Git hooks for automatic sync on commit:
```bash
node .githooks/install.mjs
```

Installed hooks:
- `pre-commit`: Auto-runs governance `sync` when `dev-docs/` files are staged
- `commit-msg`: Validates conventional commit format

To check status or uninstall:
```bash
node .githooks/install.mjs --check
node .githooks/install.mjs --uninstall
```

## Key principles
- Task execution progress is maintained in `dev-docs/**` (task bundle is the SoT for status).
- Task identity is anchored by `.ai-task.yaml` (`task_id`).
- Project semantic mapping lives in `.ai/project/main/registry.yaml`.
- Derived views are not authoritative; regenerate them instead of editing AUTO sections.

## Migration note
Missing `.ai-task.yaml` is allowed (warning) during migration, but any existing meta file must be valid, unique, and consistent with the registry.

## Contract
All behavior MUST follow `.ai/project/CONTRACT.md`.
