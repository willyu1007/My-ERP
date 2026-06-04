# Example: Sync SSOT to provider stubs

## Scenario
Your repo keeps skills in `.ai/skills/` but you also want the same skills discoverable under:
- `.codex/skills/` (Codex)
- `.claude/skills/` (Claude Code)

## Commands
```bash
# Run from repo root.

# Preview (no writes)
node .ai/scripts/sync-skills.mjs --scope current --providers both --dry-run

# Apply (reset provider roots; requires explicit acknowledgement)
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```
