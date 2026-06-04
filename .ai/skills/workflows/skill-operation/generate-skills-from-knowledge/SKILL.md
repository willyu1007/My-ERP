---
name: generate-skills-from-knowledge
description: Turn one or more knowledge documents into a provider-agnostic Agent Skills bundle (SKILL.md + examples/templates), using a plan -> apply -> lint workflow.
---

# Generate Skills from Knowledge Documents

## Purpose
Convert existing knowledge docs (one or many) into **discoverable, reusable Agent Skills** that follow a consistent, lintable structure and **progressive disclosure**.

The generate-skills-from-knowledge skill is provider-agnostic: the output is plain folders + `SKILL.md` files and can be consumed by any agent runtime that discovers skills from the filesystem.

## When to use
Use the generate-skills-from-knowledge skill when you have:
- A set of Markdown/text docs that describe **how work should be done**, and you want to convert them into skills.
- Legacy "how-to" docs that are too long or too project-specific and need to become **portable** skills.
- Multiple docs with overlapping guidance and you want to **split/merge** them into capability-oriented skills.

Do not use the skill when:
- The source material is confidential and cannot be copied into a work area.
- You only need a quick summary; you do not need reusable procedures.

## Inputs
You MUST provide:
- **Source documents**: one or more file paths (prefer Markdown). If not Markdown, provide a plain-text export.
- **Output target**:
  - `skills_root` (directory where the generated skills will be written), OR
  - a writable working directory to create a standalone skills bundle.
- **Portability constraints**:
  - whether to remove provider-specific terms,
  - whether project paths/scripts should be generalized,
  - any allowed exceptions (for example, "dev-docs may keep repo-specific layout").

You SHOULD provide:
- Desired **taxonomy** (optional): up to two tiers (e.g., `backend/common`, `frontend/components`, `workflows/common`).
- Existing naming conventions for skill names (kebab-case verb + domain).

## Outputs
The expected outputs are:
- A set of skill directories, each containing:
  - `SKILL.md` (required)
  - `reference.md` (optional, for deep details)
  - `examples/` (optional, scenario-specific examples)
  - `templates/` (optional, reusable snippets/skeletons)
- A `CONVERSION_REPORT.md` summarizing:
  - source documents
  - created/updated skills
  - split/merge operations
  - known limitations / follow-ups
- A lint report (stdout) from `python3 ./scripts/skillgen.py lint ...` (recommended)

## Command working directory
All relative paths in commands (for example `./scripts/skillgen.py` and `./templates/...`) are relative to:
- `.ai/skills/workflows/skill-operation/generate-skills-from-knowledge/`

## Steps
### Scenario A: Convert docs into a skills bundle (recommended default)
1. **Inventory** the source docs (file list) and decide what is IN/OUT of scope.
2. **Derive candidate skills**:
   - one skill should map to one capability (not one file),
   - split long docs into multiple skills by trigger/intent,
   - merge overlapping docs when they solve the same intent.
3. Create a **conversion plan** using `./templates/conversion-plan.schema.json`:
   - define the skills to create,
   - map each skill to its source docs,
   - define which examples/templates to extract.
4. Review the plan and obtain approval before writing files:
   - confirm the skill taxonomy and naming
   - confirm portability constraints (remove provider/project specifics)
   - confirm what will be created vs updated
5. Run:
   - `python3 ./scripts/skillgen.py apply --plan <plan.json>` to scaffold the skill directories.
6. For each generated skill:
   - rewrite `SKILL.md` to be **high-signal and short**,
   - move large examples into `examples/`,
   - move reusable snippets into `templates/`,
   - put deep rationale into `reference.md`,
   - remove cross-skill links ("See also", "Related docs").
7. Run:
   - `python3 ./scripts/skillgen.py lint --skills-root <skills_root>` and fix issues until clean.
8. Package the bundle (optional):
   - `python3 ./scripts/skillgen.py package --skills-root <skills_root> --out <bundle.zip>`

### Scenario B: Convert docs directly into a repository skills root
Follow Scenario A, but set `skills_root` to the repository's skills SSOT directory.

If your repo has additional syncing rules (provider stubs, monorepo layouts), treat those as **outside** the scope; the skill only produces the SSOT-format skills.

## Boundaries
- You MUST NOT include secrets, credentials, or internal-only URLs in generated skills.
- You MUST NOT copy large logs or whole source documents verbatim into `SKILL.md`.
- You SHOULD avoid hard-coded repository paths unless the target is explicitly "dev-docs" with a known layout.
- You MUST keep each `SKILL.md` <= 500 lines by moving detail into `reference.md`, `examples/`, and `templates/`.

## Verification
Run the linter and confirm:
- the conversion plan was reviewed and approved before applying
- every skill directory contains `SKILL.md` with valid YAML frontmatter
- `name` matches the directory name
- no `resources/` directories exist
- `SKILL.md` line count is within limits
- examples/templates live under `examples/` and `templates/` rather than bloating `SKILL.md`
- cross-skill relative links (e.g., `../<other-skill>`) are absent

## Included assets
- `./scripts/skillgen.py`: plan/apply/lint/package helper
- `./scripts/init_skill.py`: optional helper to scaffold a new skill directory
- `./templates/conversion-plan.schema.json`: JSON Schema for a conversion plan
- `./templates/conversion-plan.example.json`: example plan
- `./templates/skill-skeleton/SKILL.md`: copy/pasteable skeleton for manual skill authoring
- `./examples/quickstart.md`: end-to-end usage example
- `./examples/plan-writing-guide.md`: how to write a good plan for an LLM
