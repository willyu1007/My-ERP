# Manage Skill Packs - Reference

## Files and roles

- `.ai/skills/_meta/packs/*.json`
  - Pack definitions (same schema as `sync-manifest.json`)
- `.ai/skills/_meta/skillsctl-state.json`
  - `enabledPacks`: enabled pack ids
  - `lastSync`: last wrapper sync time (ISO string)
- `.ai/skills/_meta/sync-manifest.json`
  - Effective selection used by `sync-skills.mjs`

## Why a state file exists

Without state, disabling a pack is ambiguous (you cannot know which prefixes/skills were added by which pack).
`ctl-skill-packs` persists the set of enabled packs so disable/remove can avoid removing prefixes still required by other enabled packs.

## Verification

- Print the effective selection:
  - `node .ai/skills/_meta/ctl-skill-packs.mjs status`
- Re-generate wrappers:
  - `node .ai/skills/_meta/ctl-skill-packs.mjs sync --providers both`

