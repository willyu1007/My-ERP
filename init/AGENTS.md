# Agent guidance for the init kit

The repository includes an `init/` bootstrap kit for checkpointed project initialization.

**For detailed workflow**: See `init/_tools/skills/initialize-project-from-requirements/SKILL.md`

---

## Key principles

- Do not skip stages (A -> B -> C).
- Do not advance stages without explicit user approval.
- Staleness protection: approvals require artifacts unchanged since the last successful validate/check.
- Do not hand-edit pipeline-owned fields in `init/_work/.init-state.json`; use pipeline commands.
  - Exception: the LLM MAY set `llm.language` (string; free-form) to drive user-facing docs in any language.
    - Preferred: `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs set-llm-language --repo-root . --value "<language>"`
- Do not create dev-docs task bundles during initialization.
- LLM-driven docs:
  - `init/START-HERE.md`: user-friendly intake + running notebook (key inputs, current conclusions, AI questions).
  - `init/INIT-BOARD.md`: concise stage/status board (LLM-owned layout).
  - Entry docs are created by the LLM only after `llm.language` is set (minimal: START-HERE + INIT-BOARD).
  - The pipeline never rewrites the whole INIT-BOARD; it only updates the machine snapshot block between:
    - `<!-- INIT-BOARD:MACHINE_SNAPSHOT:START -->`
    - `<!-- INIT-BOARD:MACHINE_SNAPSHOT:END -->`
  - LLM MAY re-layout INIT-BOARD at any time, but MUST preserve the snapshot marker block.
- START-HERE rolling refresh (LLM-managed):
  - At each stage start (A->B, B->C, C->complete), summarize the finished stage and append it to a folded Archive section at the end of `init/START-HERE.md`.
  - Keep the top of `init/START-HERE.md` one-screen readable and focused on the current stage's main questions.

---

## Command entry point

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs <command> [options]
```

| Location | Purpose |
|----------|---------|
| `init/_tools/` | Shipped init tooling |
| `init/_work/` | Runtime artifacts |

---

## Quick reference

| Stage | Validate | Confirm | Approve |
|-------|----------|---------|---------|
| A | `check-docs --strict` | - | `approve --stage A` |
| B | `validate` | `review-packs` | `approve --stage B` |
| C | `apply --providers both` | `skill-retention` | `approve --stage C` |

**Stage C checkpoint** (before approval):
1. **Skill retention**: `skill-retention --repo-root .` then `skill-retention --apply`
2. **Update root docs** (recommended): `update-root-docs` then `update-root-docs --apply`

**Post-init cleanup**:
Before removing `init/`, run the LLM doc-path hygiene pass defined in `init/_tools/skills/initialize-project-from-requirements/SKILL.md` to remove stale init routes from active docs.

```bash
# Archive + remove init/
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . --apply --i-understand --archive
```

---

## Troubleshooting

**EPERM on Stage C**: Re-run `apply` in an elevated shell.

---

## Feature notes

For feature-specific behavior, see `init/_tools/feature-docs/`.

Key rule: `features.<id>: true` triggers materialization; `context.*`, `db.*`, etc. are configuration only.
