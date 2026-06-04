# Init kit (robust 3-stage pipeline)

> Human-facing documentation. If you are an LLM/AI assistant, skip this file and follow `init/AGENTS.md` instead.

The `init/` package provides a 3-stage, checkpointed workflow to bootstrap a repository from requirements:

- **Stage A**: Requirements docs -> `init/_work/stage-a-docs/`
- **Stage B**: Blueprint -> `init/_work/project-blueprint.json`
- **Stage C**: Scaffold + configs + skill packs + features + wrapper sync

---

## Flow overview

```mermaid
flowchart TD
    subgraph PreInit [Pre-Init]
        Start([start --lang zh/en])
        SetLang([set-llm-language])
        StartHere[init/START-HERE.md]
        InitBoard[init/INIT-BOARD.md]
    end

    subgraph StageA [Stage A: Requirements]
        A1[Fill Stage A docs]
        A2[check-docs --strict]
        A3[approve --stage A]
    end

    subgraph StageB [Stage B: Blueprint]
        B1[Fill blueprint JSON]
        B2[validate]
        B3[suggest-packs / suggest-features]
        B4[review-packs]
        B5[approve --stage B]
    end

    subgraph StageC [Stage C: Apply]
        C1[apply --providers both]
        C2[skill-retention]
        C3[update-root-docs]
        C4[approve --stage C]
    end

    subgraph PostInit [Post-Init]
        Cleanup[cleanup-init --archive]
        Archive[docs/project/overview/]
    end

    Start --> SetLang
    SetLang --> StartHere
    SetLang --> InitBoard
    StartHere --> A1
    A1 --> A2
    A2 -->|pass| A3
    A2 -->|fail| A1
    A3 --> B1
    B1 --> B2
    B2 -->|pass| B3
    B2 -->|fail| B1
    B3 --> B4
    B4 --> B5
    B5 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4
    C4 --> Cleanup
    Cleanup --> Archive
```

---

## Entry points

| File | Purpose | Edit? |
|------|---------|-------|
| `init/START-HERE.md` | Human/LLM entry + running log | Yes (LLM-maintained) |
| `init/INIT-BOARD.md` | Concise status board (LLM-owned layout; pipeline snapshot inside markers) | Yes (LLM-maintained) |
| `init/_work/AGENTS.md` | Workdir rules + SSOT guidance | Reference |

---

## Quick start

```bash
# 1. Initialize pipeline state (choose zh or en)
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root . --lang <zh|en>

# 2. Set user-facing doc language (free-form)
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs set-llm-language --repo-root . --value "<language>"

# 3. Check progress
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs status --repo-root .

# 4. See next actions
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs advance --repo-root .
```

After `start` + language selection, ask the LLM to create `init/START-HERE.md` and `init/INIT-BOARD.md` from the templates under `init/_tools/skills/initialize-project-from-requirements/templates/`.

---

## Stage flow summary

| Stage | Validate | Confirm | Approve |
|-------|----------|---------|---------|
| A | `check-docs --strict` | - | `approve --stage A` |
| B | `validate` | `review-packs` | `approve --stage B` |
| C | `apply --providers both` | `skill-retention` | `approve --stage C` |

For detailed stage instructions, see `init/_tools/skills/initialize-project-from-requirements/SKILL.md`.

---

## Key principles

- **Do not skip stages**: complete A -> B -> C in order
- **Explicit approval**: every stage transition requires user confirmation
- **Validation gates**: each stage has a validation step before approval
- **Staleness checks**: approvals require artifacts unchanged since the last validate/check

---

## Blueprint overview

Schema: `init/_tools/skills/initialize-project-from-requirements/templates/project-blueprint.schema.json`

| Section | Purpose |
|---------|---------|
| `project.*` | Name, description |
| `repo.*` | Language, package manager, layout |
| `capabilities.*` | Frontend, backend, database, API |
| `db.ssot` | Database SSOT mode: `none` / `repo-prisma` / `database` / `convex` |
| `features.*` | Optional features to enable in Stage C |

---

## Optional features

For feature details and configuration, see:
- `init/_tools/feature-docs/README.md` (feature overview)
- `init/_tools/feature-docs/*.md` (per-feature docs)

---

## Post-init options

```bash
# Remove init/ (no archive)
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init --repo-root . --apply --i-understand

# Archive to docs/project/overview/ + remove init/
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init --repo-root . --apply --i-understand --archive
```

---

## More information

- LLM guidance: `init/AGENTS.md`
- Command reference: `init/_tools/skills/initialize-project-from-requirements/SKILL.md`
- Detailed reference: `init/_tools/skills/initialize-project-from-requirements/reference.md`
