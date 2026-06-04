# init/_work (Init Workdir) - Rules of the Road

`init/_work/` is the **working directory** for the init pipeline. The directory holds the stage outputs (human SSOT + machine SSOT) and the pipeline-owned runtime state that drives the status board.

## Read first (high-signal rules)

- Only put **auditable, verifiable outcomes** into `init/_work/`:
  - Stage A: `init/_work/stage-a-docs/*` (human-readable SSOT)
  - Stage B: `init/_work/project-blueprint.json` (machine-readable SSOT)
- Keep Stage A outputs in **one language per init run** (choose once via `start --lang <zh|en>`; do not mix languages across Stage A docs).
- Do **not** hand-edit pipeline-owned fields in `init/_work/.init-state.json`. The pipeline owns the state file and uses it as the audit trail.
  - Exception: the LLM MAY add/update `llm.language` (string; free-form) to drive user-facing docs in any language.
- Do **not** commit raw materials (PDFs/screenshots/spreadsheets) into the repo as part of init. Instead, record **links + extracted decisions**:
  - Register sources in `init/START-HERE.md`
  - Write decisions into Stage A docs and/or the blueprint
- Do **not** store secrets in Stage A docs or the blueprint (use placeholders and document secret handling separately).
- File/dir names under `init/_work/` are part of the pipeline contract. Do **not** rename:
  - `stage-a-docs/`, `project-blueprint.json`, `.init-state.json`

## What lives in `init/_work/` (and how to treat the artifacts)

- `init/_work/AGENTS.md` (this file)
  - Purpose: local rules for working inside the init workdir.

- `init/_work/.init-state.json` (pipeline-owned runtime state)
  - Created/updated by the pipeline.
  - Do not edit pipeline-owned fields manually.
  - Exception: the LLM MAY add/update `llm.language` (string; free-form).
  - To restart from scratch: delete `init/_work/.init-state.json`, then re-run `start`.

- `init/_work/stage-a-docs/` (Stage A: requirements SSOT)
  - You draft/maintain the 4 docs here (keep the template headings intact):
    - `requirements.md`
    - `non-functional-requirements.md`
    - `domain-glossary.md`
    - `risk-open-questions.md` (all TBDs must be tracked here with owner/options/due)
  - Validation (required):
    - `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict`
  - Board hygiene (recommended): after answering a must-ask question, update the checklist so `init/INIT-BOARD.md` stays accurate:
    - `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask --repo-root . --key <id> --asked --answered --written-to <path>`

- `init/_work/project-blueprint.json` (Stage B: blueprint SSOT)
  - Encodes the decisions that drive Stage C scaffold/config generation, pack selection, and feature materialization.
  - Keep the blueprint **decision-oriented**: avoid implementation details that belong in code.
  - Validation (required):
    - `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root . --blueprint init/_work/project-blueprint.json`
  - Packs confirmation (required before Stage B approval):
    - Have the user review `blueprint.skills.packs`, then run:
      - `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .`

- `init/_work/skill-retention-table.template.md` (Stage C checkpoint artifact)
  - Required before approving Stage C.
  - Use the table to decide which `.ai/skills/` to keep/delete, then confirm via `skill-retention`.

## Relationship to the entry files (avoid info explosion)

- `init/START-HERE.md` (LLM-maintained): user-friendly intake + running notebook (key inputs, current conclusions, AI questions, folded archive).
- `init/INIT-BOARD.md` (LLM-owned layout): concise stage/status board.
  - The pipeline updates ONLY the machine snapshot block between:
    - `<!-- INIT-BOARD:MACHINE_SNAPSHOT:START -->`
    - `<!-- INIT-BOARD:MACHINE_SNAPSHOT:END -->`
  - The rest of the file is owned by the LLM (layout/wording/sections).
- `init/README.md` / `init/AGENTS.md`: human/LLM entrypoints for the overall init workflow.

## Recovery (missing files)

If templates were accidentally deleted, run:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs repair --repo-root .
```

The repair command restores missing init artifacts using **copy-if-missing only** (no overwrites).
