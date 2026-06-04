---
name: manage-skill-packs
description: Enable or disable skill packs via ctl-skill-packs and re-sync provider wrappers without manually editing the manifest.
---

# Manage Skill Packs

## Purpose

Provide a safe, script-driven way to switch skill packs by updating `.ai/skills/_meta/sync-manifest.json` and re-syncing provider wrappers.

## When to use

Use this skill when you need to:

- enable a pack (for example `context-core`) so its skills become discoverable
- disable a pack to reduce scope and noise
- re-sync wrappers after changing SSOT skills or selection rules

Do NOT use this skill if:

- you intend to directly edit `.codex/skills/` or `.claude/skills/` (those are generated wrappers)

## Inputs

- Pack id (a JSON file name under `.ai/skills/_meta/packs/`, without `.json`)
- Provider selection (optional): `codex`, `claude`, or `both`

## Outputs

- Updated `.ai/skills/_meta/sync-manifest.json` (effective selection)
- Updated `.ai/skills/_meta/skillsctl-state.json` (enabled packs + last sync)
- Regenerated wrappers under provider skill roots (via `sync-skills.mjs`)

## Steps

1. List available packs:
   - `node .ai/skills/_meta/ctl-skill-packs.mjs list-packs`

2. Enable a pack and sync wrappers:
   - `node .ai/skills/_meta/ctl-skill-packs.mjs enable-pack <packId> --providers both`

3. Disable a pack and sync wrappers:
   - `node .ai/skills/_meta/ctl-skill-packs.mjs disable-pack <packId> --providers both`

4. Inspect current selection:
   - `node .ai/skills/_meta/ctl-skill-packs.mjs status`

5. Re-sync wrappers (without changing packs):
   - `node .ai/skills/_meta/ctl-skill-packs.mjs sync --providers both`

## Verification

```bash
node .ai/skills/_meta/ctl-skill-packs.mjs status
node .ai/skills/_meta/ctl-skill-packs.mjs list-packs
```

## Boundaries

- You MUST NOT edit `.ai/skills/_meta/sync-manifest.json` directly.
- You MUST NOT edit provider wrapper directories directly (`.codex/skills/`, `.claude/skills/`).
- You SHOULD treat packs as additive bundles of capabilities and keep the enabled set minimal.

## References

- `reference.md`
