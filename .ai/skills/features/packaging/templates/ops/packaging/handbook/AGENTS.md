# Packaging Handbook

## Purpose
Store packaging decisions and plans under `ops/packaging/handbook/` (design notes, tradeoffs, checklists).

## What belongs here
- Base image choices and rationale
- Build optimization notes (cache strategy, multi-stage patterns, multi-arch)
- Artifact naming/tagging strategy
- Registry conventions and access assumptions (NO secrets)

## What does NOT belong here
- Executable automation (use `ops/packaging/scripts/` and `.ai/skills/features/packaging/scripts/ctl-packaging.mjs`)
- Credentials, tokens, or private keys

## Verification
- Ensure any operational steps referenced here have an executable entry point under `ops/packaging/scripts/` (human-run).
