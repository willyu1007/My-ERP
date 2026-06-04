# Skill: initialize-project-from-requirements

The skill connects the end-to-end initialization flow:

`requirements docs -> project blueprint -> scaffold/config generation -> skills sync`

It records an auditable init state throughout the workflow so that each stage has an explicit **validate + user approval** checkpoint.

Goal: a robust, repeatable, rollback-friendly initialization workflow (not "fastest possible").

---

## LLM driving contract (entrypoints + language)

The init kit is intended to be **LLM-driven** (or human-driven with the same discipline):

- `init/START-HERE.md` (LLM-maintained): user-friendly intake + running notebook
  - Keep START-HERE one-screen: current conclusions, a key inputs table (`todo`/`confirmed`/`tbd`), and a short "AI questions" list.
  - Older context goes to a folded Archive section at the end (append-only; LLM-written).
- `init/INIT-BOARD.md` (LLM-owned layout): concise stage/status board
  - The pipeline updates ONLY a machine snapshot block inside INIT-BOARD (between snapshot markers). The pipeline never rewrites the whole file.
  - Board content SHOULD be derived from `init/_work/.init-state.json` (audit trail) and the machine snapshot block, not from chat history.
- Language (LLM-managed; supports more than zh/en without script changes):
  - Ask the user to confirm the documentation language.
  - Record the selected language in `init/_work/.init-state.json` under `llm.language` (string; free-form).
    - Preferred: `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs set-llm-language --repo-root . --value "<language>"`
  - Render `init/START-HERE.md` and `init/INIT-BOARD.md` in that language.
- Pipeline language (zh/en):
  - `start --lang <zh|en>` still controls Stage A templates/validation.
  - If the user language is not zh/en, use `--lang en` and rely on `llm.language` for user-facing docs.

SSOT rule:
- Decisions MUST be written into Stage A docs and/or the blueprint (not just chat).
- The state file (`init/_work/.init-state.json`) is the audit trail and drives the board.

## START-HERE maintenance protocol (LLM-only)

Goal: keep `init/START-HERE.md` as the user-friendly intake + notebook (key inputs), while `init/INIT-BOARD.md` carries stage mechanics.

Rules:
- The pipeline never writes `init/START-HERE.md` (LLM-created).
- Keep the top of `init/START-HERE.md` one-screen readable; avoid pasting long transcripts.
- Do not show explicit "SSOT mapping" tables; capture user inputs + current conclusions only.
- Keep an Archive section at the end (folded by default; append-only; LLM-written).

LLM actions (required):
- After every user message: update current conclusions, key inputs table (todo/confirmed/tbd), and AI questions.
- After every pipeline command: ensure `init/INIT-BOARD.md` is up to date (the pipeline refreshes the machine snapshot automatically; the LLM may re-layout the rest as needed).
- After each stage approval (`approve`): do a START-HERE rolling refresh (append a folded archive snapshot; reset the top focus for the new stage).

Templates (recommended):
- `templates/START-HERE.llm.template.md`
- `templates/INIT-BOARD.llm.template.md`

## Inputs

### Stage A (requirements docs, required)

Working location (default: `init/_work/stage-a-docs/`):

- `init/_work/stage-a-docs/requirements.md`
- `init/_work/stage-a-docs/non-functional-requirements.md`
- `init/_work/stage-a-docs/domain-glossary.md`
- `init/_work/stage-a-docs/risk-open-questions.md`

### Stage B (blueprint, required)

Working location (default): `init/_work/project-blueprint.json`

> Optional: if you plan to remove `init/` after completion, use `cleanup-init --archive` to move artifacts to `docs/project/overview/`.

### Optional: features

Feature flags live under `blueprint.features`.
Exception: IaC is enabled by `iac.tool` (`none | ros | terraform`); `features.iac` is optional.

**No external payload directory is required.** Feature templates are integrated in the template repository under:

- `.ai/skills/features/<feature-id>/templates/` (some features source templates from nested skills; for database: `.ai/skills/features/database/sync-code-schema-from-db/templates/` or `.ai/skills/features/database/convex-as-ssot/templates/`, depending on `db.ssot`)

Stage C `apply` materializes enabled features by copying templates into the repo (copy-if-missing by default) and then running the corresponding control scripts (Node under `.ai/scripts/` and/or Python under `.ai/skills/features/**/scripts/`, depending on the feature).

---

## Outputs (written to disk)

### Working files (during initialization)

- Human intake entry: `init/START-HERE.md` (manual; never overwritten)
- Status board: `init/INIT-BOARD.md` (LLM-owned layout; the pipeline updates machine snapshot only)
- Workdir rules: `init/_work/AGENTS.md` (copy-if-missing; safe to edit)
- Stage A docs: `init/_work/stage-a-docs/*`
- Blueprint: `init/_work/project-blueprint.json`
- Init state file: `init/_work/.init-state.json`

### Archived files (after `cleanup-init --archive`)

- Stage A docs: `docs/project/overview/*`
- Blueprint: `docs/project/overview/project-blueprint.json`
- Init state file: `docs/project/overview/init-state.json`
- Human intake entry (snapshot): `docs/project/overview/START-HERE.md`
- Status board (snapshot): `docs/project/overview/INIT-BOARD.md`

### Stage C outputs

- Directory scaffold (examples):
  - `src/` or `apps/` + `packages/` (based on `repo.layout`)
  - `docs/diagrams/` (if diagram capability is enabled)
  - `ops/` (if DevOps scaffold is enabled)
- Config files generated by `scripts/scaffold-configs.mjs` (for example `.gitignore`, lint/test/format configs, depending on the blueprint)
- Root `README.md` + `AGENTS.md` can be updated from the blueprint via `update-root-docs` (preview diff, then re-run with `--apply`)
- Skills selection (SSOT):
  - `.ai/skills/_meta/sync-manifest.json` (flat schema: `version/includePrefixes/includeSkills/excludeSkills`)
  - If `.ai/skills/_meta/ctl-skill-packs.mjs` exists, pack toggles must be done via ctl-skill-packs
- Provider wrappers generated/updated:
  - `node .ai/scripts/sync-skills.mjs` (supports `--providers`)

### Optional feature outputs

Depending on `blueprint.features`, Stage C may also materialize:

- Context Awareness: `docs/context/**` + `config/environments/**` (and related context contracts)
- Database: `db/**` (when `db.ssot=database`), `prisma/**` (when `db.ssot=repo-prisma`), or `convex/**` + `docs/context/convex/**` (when `db.ssot=convex`)
- UI: `ui/**` + `docs/context/ui/**`
- Environment: `env/**` + `docs/project/env-ssot.json` + `docs/project/policy.yaml` (and optionally generated `env/.env.example` + `docs/env.md`)
- IaC: `ops/iac/<tool>/` + `docs/context/iac/overview.json` (enabled via `iac.tool`)
- Packaging: `ops/packaging/**` + `docs/packaging/registry.json`
- Deployment: `ops/deploy/**`
- Observability: `observability/**` + `docs/context/observability/**`
- Release: `release/**` + `release/.releaserc.json.template`

---

## Mandatory workflow rules

1. Every stage transition requires **validation + explicit user approval**.
   - Validation is recorded in `init/_work/.init-state.json` by pipeline commands.
   - Stage advancement must use `approve` (do not hand-edit the state file to "skip" stages).
2. Do not advance stages without explicit user approval.
3. Features are materialized **on demand**:
   - Only `blueprint.features.*` triggers materialization.
   - `blueprint.context.*` is configuration only and does not trigger enabling by itself.
4. The manifest schema is the **flat schema** (do not use older nested shapes like `collections.current`).
5. Config generation has a single SSOT: `scripts/scaffold-configs.mjs`.
6. Do not create dev-docs task bundles during initialization; use dev-docs after init completes.
7. Before deleting `init/`, the LLM MUST run a doc-path hygiene pass to remove initialization-only routes/instructions from active docs (root `AGENTS.md`, `README.md`, and other active routing docs as applicable).

---

## Standard workflow (run from repo root)

All command paths in the document assume you run from the repo root.

### 0) Initialize state

Before running `start`:
- Ask the user to confirm the documentation language.
- After `start` creates `init/_work/.init-state.json`, write `llm.language` (string; free-form), then (re-)render `init/START-HERE.md` and `init/INIT-BOARD.md` in that language.

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root . --lang <zh|en>
```

Then open:
- `init/START-HERE.md` (LLM-maintained intake + notebook)
- `init/INIT-BOARD.md` (LLM-owned layout; pipeline updates only the machine snapshot block between markers)
- `init/_work/AGENTS.md` (workdir rules)

### 1) Stage A: validate requirements docs -> user approval

**Pre-step (optional)**: Terminology alignment - ask if user wants to sync/align terms now or skip. If sync, use `init/_work/stage-a-docs/domain-glossary.md` as SSOT.

**Validation**:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs \
  --repo-root . \
  --strict
```

Optional (keeps the board accurate): update the must-ask checklist after you write the answer into a doc (see `reference.md` for the full key list):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to init/_work/stage-a-docs/requirements.md
```

**Approval** (after user explicitly approves Stage A docs):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

### 2) Stage B: validate blueprint -> user approval

**Validation**:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate \
  --repo-root .
```

Optional: recommend packs/features based on capabilities:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
```

**Confirm packs** (after user reviews `blueprint.skills.packs`):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```

**Approval** (after user explicitly approves the blueprint):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

#### Supported languages

| Language | Built-in template | Recommended package manager |
|----------|-------------------|----------------------------|
| typescript | yes | pnpm |
| javascript | yes | pnpm |
| go | yes | go |
| c / cpp | yes | xmake |
| react-native | yes | pnpm |
| python | LLM-generated | poetry |
| java / kotlin | LLM-generated | gradle |
| dotnet | LLM-generated | dotnet |
| rust | LLM-generated | cargo |

For languages without built-in templates, the LLM should generate config files based on `templates/llm-init-guide.md`.

#### Feature flags

Set `features.<id>: true` in the blueprint to install a feature during Stage C:

| Feature | When to enable |
|---------|----------------|
| `contextAwareness` | API contracts, DB schema, or BPMN tracking needed; required when `db.ssot != "none"` |
| `database` | `db.ssot != "none"` (schema SSOT scaffolding; requires `contextAwareness`) |
| `ui` | Frontend with stable UI/UX foundation |
| `environment` | Strict env var contract needed |
| `packaging` | Containerization / artifact packaging |
| `deployment` | Multi-environment deployment |
| `release` | Automated changelog / versioning |
| `observability` | Metrics / logging / tracing contracts |

**Key rule**: `features.*` triggers materialization; `context.*`, `db.*`, etc. are configuration only.

### 3) Stage C: write scaffold/configs/packs/features/wrappers -> user approval

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply \
  --repo-root . \
  --providers both
```

`apply` is stage-gated by default: the command refuses unless init state is at Stage C (or complete). Use `--no-stage-gate` only for advanced debugging.

Stage C `apply` does **not** auto-update the root `README.md` / `AGENTS.md`. Use `update-root-docs` to preview a diff and (after explicit approval) apply the updates; include those changes in the Stage C review if the command is run before approval.

Avoid `apply --cleanup-init` in normal workflows. Run cleanup as a separate final step after the LLM doc-path hygiene gate.

Troubleshooting: if Stage C `apply` fails with `EPERM` when writing `.codex/skills/` or `.claude/skills/`, re-run the same `apply` command in an elevated shell. Do not change the blueprint between attempts.

After the user reviews the changes and explicitly approves, run:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

### 4) Stage C checkpoint: skill retention and pruning (required)

Before approving Stage C, generate and fill the skill retention table:

1) Ensure `init/_work/skill-retention-table.template.md` exists (copy from the template if needed).
2) Fill the table with current skills from `.ai/skills/` (translate descriptions if needed).
3) Ask the user which skills to keep/delete (record TBD if undecided).
4) Preview deletions, then confirm and delete (parses `## Deletion List` automatically):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs skill-retention --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs skill-retention --repo-root . --apply
```

### Optional: prune unused feature tooling (tests/scripts)

The template repository ships:

- Central public feature-pack tests under `.ai/tests/suites/` (not per-skill `tests/` folders)
- Maintainer-only template regressions under `.ai/tests/maintainer/`
- Feature controller scripts under `.ai/skills/features/**/scripts/` (plus cross-cutting controllers under `.ai/scripts/`)

Initialization does **not** auto-delete these. If the user explicitly does not need the corresponding feature packs, you MAY remove the related paths (after confirmation), for example:

- DB mirror tooling: `.ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs`, `.ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs`
- Convex SSOT tooling: `.ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs`
- CI tooling: `.ai/skills/features/ci/scripts/ctl-ci.mjs`
- Deployment tooling: `.ai/skills/features/deployment/scripts/ctl-deploy.mjs`, `.ai/skills/features/deployment/scripts/rollback.mjs`
- Packaging tooling: `.ai/skills/features/packaging/scripts/ctl-packaging.mjs`
- Release tooling: `.ai/skills/features/release/scripts/ctl-release.mjs`
- Observability tooling: `.ai/skills/features/observability/scripts/ctl-observability.mjs`
- Public feature-pack test suites: `.ai/tests/suites/database/`, `.ai/tests/suites/environment/`, `.ai/tests/suites/ui/`
- Maintainer-only template regressions: `.ai/tests/maintainer/environment/`, `.ai/tests/maintainer/ui/`

After pruning, re-run wrapper sync:

```bash
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```

### 5) Post-init: update root README.md and AGENTS.md (recommended)

After Stage C approval, explicitly ask:

> Do you want to record the project type, tech stack, and key directories in the root `AGENTS.md`, and update the root `README.md`?

If approved, use `update-root-docs` (shows a diff; requires `--apply` to write):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-root-docs --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-root-docs --repo-root . --apply
```

### 6) Post-init: migrate glossary to context layer (if context-awareness enabled)

After Stage C approval, if `features.contextAwareness=true` and `init/_work/stage-a-docs/domain-glossary.md` contains substantive terms (not just placeholders):

1. Read `init/_work/stage-a-docs/domain-glossary.md` and extract each defined term.
2. For each term, write an entry into `docs/context/glossary.json` using this structure:

```json
{
  "term": "<term name>",
  "definition": "<concise definition, 1-3 sentences>",
  "scope": "global",
  "aliases": ["<synonym1>", "<synonym2>"],
  "see_also": ["<related-term>"]
}
```

- `term` and `definition` are required; `scope`, `aliases`, `see_also` are optional.
- Skip terms that are placeholder text (e.g., `<Term>`, `- ...`).
- Preserve the `version: 1` and update `updatedAt` to the current ISO timestamp.

3. After writing, run:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch
```

Alternatively, use the CLI to add terms one by one:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-term --term "tenant" --definition "An isolated customer organization" --aliases "organization,org"
```

### 7) Post-init gate: LLM doc-path hygiene before init cleanup (required when removing init/)

Goal: after initialization completes, remove stale initialization routes/instructions from active docs so agents no longer route to deleted `init/` paths.

Scope (minimum):
- Root `AGENTS.md`
- Root `README.md` (if it contains init routing references)
- Any active routing docs that still point to `init/` (for example top-level workflow/router docs)

Required actions:
1. LLM scans active docs for initialization-only references:

```bash
rg -n -uu "init/AGENTS\\.md|init/_tools|First time / Project setup|Project initialization|\\binit/" AGENTS.md README.md .ai dev-docs --glob "*.md"
```

2. LLM edits docs to remove or replace init-only routes/instructions:
- Remove entries like `First time / Project setup -> init/AGENTS.md` once init is being retired.
- Remove `Key Directories` rows that route active work to `init/` paths.
- Replace with current long-term entry points (for example `.ai/AGENTS.md`, `.ai/project/AGENTS.md`, `dev-docs/AGENTS.md`) as appropriate.

3. LLM verifies no active-doc routing still depends on `init/`:

```bash
rg -n -uu "init/AGENTS\\.md|init/_tools|First time / Project setup" AGENTS.md README.md .ai dev-docs --glob "*.md"
```

Acceptance criteria:
- No active routing table/instructions point to `init/` paths.
- No initialization-only wording remains in active docs once `init/` is planned for removal.
- Archived historical snapshots under `docs/project/overview/**` MAY retain historical init references.

### 8) Optional: remove the init kit

When the user confirms the bootstrap kit is no longer needed:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```

---

## Context Awareness feature notes

### How the workflow is triggered

To trigger feature materialization/init, set:

- `blueprint.features.contextAwareness: true`

Optional (configuration only; does not trigger enabling):

- `blueprint.context.mode: "contract" | "snapshot"` (default: `contract`)

### Key scripts

- `.ai/skills/features/context-awareness/scripts/ctl-context.mjs`
  - `init`: initializes the `docs/context/` scaffold (idempotent)
- `.ai/scripts/ctl-project-state.mjs`
  - `init`: initializes `.ai/project/state.json` (idempotent)
  - `set-context-mode <contract|snapshot>`: sets the context mode
- `.ai/skills/_meta/ctl-skill-packs.mjs`
  - `enable-pack <packId> --no-sync`: enables a pack (writes manifest)

For full details, see `.ai/skills/features/context-awareness/`.
