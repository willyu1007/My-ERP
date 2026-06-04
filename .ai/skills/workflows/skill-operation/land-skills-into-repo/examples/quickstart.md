# Example: Install a skills bundle into a repo (safe workflow)

## Scenario
You received a skills bundle as `bundle.zip` and want to land it into `./my-repo` as an SSOT under `.ai/skills/`, with backups enabled.

## Commands
```bash
# 1) Plan (no writes)
python3 scripts/land_skills.py --repo-root ./my-repo --source ./bundle.zip --plan

# 2) Apply (writes)
python3 scripts/land_skills.py --repo-root ./my-repo --source ./bundle.zip --apply --overwrite=changed --backup

# 3) Verify
python3 scripts/land_skills.py --repo-root ./my-repo --verify
```
