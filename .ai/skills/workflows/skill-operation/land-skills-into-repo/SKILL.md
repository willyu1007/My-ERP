---
name: land-skills-into-repo
description: Install or update an Agent Skills bundle into a repository SSOT (.ai/skills/).
---

# Land Skills Into a Repository

## Purpose
Standardize the **"landing"** process for Agent Skills so a skills bundle can be applied to **any repository** and consumed by **any LLM/agent runtime** that implements the folder-based `SKILL.md` convention.

The land-skills-into-repo skill provides:
- A repeatable workflow (manual + scripted).
- A script (`./scripts/land_skills.py`) that performs a safe, auditable install/update with dry-run by default.

**Note**: Provider stubs (for `.codex/skills/`, `.claude/skills/`, etc.) should be generated using `node .ai/scripts/sync-skills.mjs`, not the land_skills.py script.

## When to use
Use the land-skills-into-repo skill when:
- You have a **skills bundle** (folder or `.zip`) and need to **install** it into a target repo's SSOT.
- You need to **update** an existing skills install and want a **diff-aware** process.

Do **not** use the skill when:
- You only need to author one new skill from scratch (use a skill-creator workflow instead).
- You are not allowed to modify the target repository (run in `--plan` mode only).
- You need to sync SSOT to provider roots (use `node .ai/scripts/sync-skills.mjs` instead).

## Inputs
You MUST obtain:
- `repo_root`: Path to the target repository root (default: current working directory).
- `source`: Path to a skills bundle:
  - a directory containing one or more skill folders, **or**
  - a directory containing an SSOT tree (for example a folder that contains `.ai/skills/`), **or**
  - a `.zip` file containing either of the above.

You MAY additionally provide:
- `ssot_dir`: Destination SSOT directory inside the repo (default: `.ai/skills`).
- `config`: A JSON config file (see `./templates/landing-config.schema.json` and `./templates/landing-config.example.json`).

## Outputs
The skill writes:
- SSOT install/update:
  - `repo_root/.ai/skills/**` (default) or your chosen `ssot_dir`.
- Backups (optional, only when overwriting):
  - `repo_root/.ai/.backups/skills-landing/<timestamp>/...` (default).

The script always produces a plan/report to stdout; it can also emit JSON via `--json-report`.

## Steps
### Step 1: Dry-run (MUST)
From the directory that contains the `SKILL.md` (the "skill root"), run:

```bash
python3 ./scripts/land_skills.py \
  --repo-root /path/to/repo \
  --source /path/to/skills-bundle.zip \
  --plan
```

Rules:
- You MUST start with `--plan` for a new repo or unknown state.
- Do not overwrite files unless you explicitly enable overwriting (see Step 2).

### Step 2: Apply (only after review)
After reviewing the plan output, apply changes:

```bash
python3 ./scripts/land_skills.py \
  --repo-root /path/to/repo \
  --source /path/to/skills-bundle.zip \
  --apply \
  --overwrite=changed \
  --backup
```

Recommended defaults:
- `--overwrite=changed` (overwrite only if content differs)
- `--backup` (capture overwritten files)

### Step 3: Verify (MUST)
Run verification after applying:

```bash
python3 ./scripts/land_skills.py \
  --repo-root /path/to/repo \
  --verify
```

The verifier checks:
- Every installed skill has a `SKILL.md` with YAML frontmatter.
- `name` is present and unique.
- No forbidden/accidental copy targets (configurable).

### Step 4: Sync provider stubs (recommended)
After landing skills into the SSOT, generate provider stubs:

```bash
# Run from repo root.
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```

This generates lightweight wrapper stubs in `.codex/skills/` and `.claude/skills/` that point to the SSOT.

## Verification

- [ ] Dry-run (`--plan`) completed before apply
- [ ] Plan output reviewed for expected changes
- [ ] Apply completed without errors
- [ ] Verification (`--verify`) passed
- [ ] Every installed skill has valid YAML frontmatter
- [ ] Provider stubs synced after landing

## Boundaries

- MUST NOT apply without reviewing dry-run plan first
- MUST obtain explicit approval before applying changes to a shared or protected repository
- MUST NOT delete or prune anything unless `--prune` is explicitly set
- MUST NOT skip verification after apply
- SHOULD create backups before overwriting (`--backup`)
- SHOULD default to non-destructive mode (`--plan`) when `--apply` is not provided
- SHOULD sync provider stubs after landing skills

## Included assets
- `./scripts/land_skills.py`: installer/verifier (stdlib-only Python).
- `./templates/landing-config.schema.json`: optional config schema.
- `./templates/landing-config.example.json`: optional config example.
- `./examples/`: minimal runnable scenarios.
