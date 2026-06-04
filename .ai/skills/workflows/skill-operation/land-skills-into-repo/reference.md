# Reference: Landing models, config, and safety

## Concepts
### Skills bundle
A **skills bundle** is either:
- A directory containing one or more skill folders, where each skill folder contains `SKILL.md`, or
- A directory containing an SSOT tree (for example `.ai/skills/**/<skill>/SKILL.md`), or
- A `.zip` of either structure.

### SSOT vs provider roots
- **SSOT (recommended)**: a provider-agnostic tree that you edit and review in PRs.
- **Provider roots**: runtime-specific discovery folders (examples below). Sync output is treated as generated.

Common provider roots (examples; configurable):
- Codex: `.codex/skills/`
- Claude Code: `.claude/skills/`

## Script interface
Run from the skill root:

```bash
python3 scripts/land_skills.py --help
```

### Typical flows
#### 1) Install bundle into SSOT
```bash
python3 scripts/land_skills.py --repo-root . --source /path/to/bundle.zip --plan
python3 scripts/land_skills.py --repo-root . --source /path/to/bundle.zip --apply --overwrite=changed --backup
```

#### 2) Sync SSOT to provider stubs (recommended)
```bash
# Run from repo root.
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```

#### 3) Verify only
```bash
python3 scripts/land_skills.py --repo-root . --verify
```

## Config file
You can provide `--config templates/landing-config.example.json` and adjust as needed.

Config fields (high level):
- `ssot_dir`: where to install the SSOT inside the repo (default `.ai/skills`)
- `ignore`: patterns to ignore during copy
- `default_overwrite`: default overwrite mode (`never` | `changed` | `always`)
- `default_prune`: default prune behavior
- `backup_dir`: where backups are stored (default `.ai/.backups/skills-landing/<timestamp>`)

## Safety model
- Default is **dry-run** (no writes) unless `--apply` is passed.
- Overwrites are controlled by `--overwrite`:
  - `never`: never overwrite; fail on conflict
  - `changed`: overwrite only if content differs
  - `always`: overwrite unconditionally (use sparingly)
- Deletions are controlled by `--prune` and are OFF by default.

## Troubleshooting
- If nothing is detected in `--source`, confirm the bundle contains `SKILL.md` files.
- If provider sync produces empty output, confirm SSOT contains skills under `ssot_dir`.
- If validation fails, run with `--json-report` to capture a machine-readable report.
