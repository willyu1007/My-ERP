# LLM Initialization Guide

Step-by-step guidance for an AI assistant to help a user complete project initialization.

---

## Overview

Before Phase 1:

1. Run (pipeline language is still `zh`/`en` for Stage A templates/validation):
   ```bash
   node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root . --lang <zh|en>
   ```
2. Ask the user to confirm the user-facing documentation language (free-form).
   - Set it in init state:
     ```bash
     node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs set-llm-language --repo-root . --value "<language>"
     ```
3. Create (LLM-written; in the selected language):
   - `init/START-HERE.md` (intake + notebook)
   - `init/INIT-BOARD.md` (concise board; LLM-owned layout, pipeline snapshot inside markers)
   - Use templates:
     - `init/_tools/skills/initialize-project-from-requirements/templates/START-HERE.llm.template.md`
     - `init/_tools/skills/initialize-project-from-requirements/templates/INIT-BOARD.llm.template.md`

**LLM maintenance protocol**:
- After every user message: update `init/START-HERE.md` (current conclusions, key inputs table, AI questions).
- After every pipeline command: the pipeline refreshes the INIT-BOARD machine snapshot automatically; the LLM may re-layout the rest of INIT-BOARD as needed.
- At each stage start (A->B, B->C, C->complete): roll the finished stage summary into a folded Archive section at the end of `init/START-HERE.md`.

```
Workflow sketch (high level):
- Phase 1: requirements
- Phase 2: tech stack
- Phase 3: blueprint
- Phase 4: features
- Phase 5: config + apply
```

---

## Phase 1: Requirements Interview

### Must-ask questions (8)

| # | Question | Write to |
|---|----------|----------|
| 0 | **Terminology alignment**: "Do we need to align domain terms now?" (sync -> use glossary as SSOT, skip -> record skip decision) | `domain-glossary.md` |
| 1 | **One-line purpose**: "In one sentence, what problem does this project solve, for whom?" | `requirements.md` |
| 2 | **User roles**: "Who are the primary users (2-5 roles)? Who is NOT a user?" | `requirements.md` |
| 3 | **MUST requirements**: "List 3-10 testable MUST-have capabilities." | `requirements.md` |
| 4 | **Out-of-scope**: "What will we NOT do in this version?" | `requirements.md` |
| 5 | **User journeys**: "Describe 2-5 top user journeys with acceptance criteria." | `requirements.md` |
| 6 | **Constraints**: "Hard constraints (compliance, security, platforms, deadlines)?" | `non-functional-requirements.md` |
| 7 | **Success metrics**: "How do we measure success (business + product + reliability)?" | `non-functional-requirements.md` |

All paths above are relative to `init/_work/stage-a-docs/`.

### Branch modules (ask if relevant)

**B1. API module** (if project has API):
- Style: REST / GraphQL / event-driven?
- Auth: none / session / JWT / OAuth2 / API key?
- Error model, pagination, versioning?
- Write to: `requirements.md` + `capabilities.api.*`

**B2. Database module** (if persistent data):
- DB kind: postgres / mysql / sqlite / mssql / mongodb / dynamodb / convex / other?
- **SSOT mode (MUST choose)**: `none` / `repo-prisma` / `database` / `convex`
- If the project uses `convex/schema.ts` and Convex `query` / `mutation` / `action`, choose `convex`.
- If `db.ssot != none`, enable both `features.database` and `features.contextAwareness`.
- `db.ssot=convex` bootstraps a repo-root `convex/` scaffold by default; nested Convex projects can be repointed later via `docs/project/db-ssot.json`.
- Consistency, migration strategy, backup?
- Write to: `non-functional-requirements.md` + `db.*`

**B3. CI/Quality module** (if maintained project):
- CI provider constraints?
- Quality gate: lint, typecheck, unit tests?
- Test levels: unit / integration / e2e?
- Write to: `non-functional-requirements.md` + `quality.*`

### Answer -> Artifact mapping

| Answer type | Write to |
|-------------|----------|
| Scope (MUST/OUT) | `requirements.md` (## Goals, ## Non-goals) |
| User journeys + AC | `requirements.md` (## Users and user journeys) |
| Constraints/NFR | `non-functional-requirements.md` |
| Terminology | `domain-glossary.md` |
| TBD decisions | `risk-open-questions.md` (with owner, options, due date) |
| Tech choices | `project-blueprint.json` |

**Stage A validation**:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

---

## Phase 2: Technology Stack Selection

### Primary language

| Language | Built-in | Package manager |
|----------|----------|-----------------|
| TypeScript | ✅ | pnpm |
| JavaScript | ✅ | pnpm |
| Go | ✅ | go |
| C/C++ | ✅ | xmake |
| React Native | ✅ | pnpm |
| Python | ❌ | poetry |
| Java/Kotlin | ❌ | gradle |
| .NET | ❌ | dotnet |
| Rust | ❌ | cargo |

Languages marked ❌: LLM generates configs (see Phase 5).

### Repo layout

- **single** -> `src/` structure (simple projects)
- **monorepo** -> `apps/` + `packages/` (multi-service)

### Framework options

**Frontend**: React, Vue, Svelte, Angular, Next.js, Nuxt
**Backend (TS/JS)**: Express, Fastify, NestJS, Hono
**Backend (Python)**: FastAPI, Django, Flask
**Backend (Go)**: Gin, Echo, Fiber
**Backend (Java)**: Spring Boot, Quarkus

---

## Phase 3: Blueprint Generation

Generate `init/_work/project-blueprint.json`:

```json
{
  "version": 1,
  "project": {
    "name": "<kebab-case>",
    "description": "<description>"
  },
  "repo": {
    "layout": "<single|monorepo>",
    "language": "<language>",
    "packageManager": "<pm>"
  },
  "capabilities": {
    "frontend": { "enabled": false },
    "backend": { "enabled": false },
    "api": { "style": "none" },
    "database": { "enabled": false, "kind": "<none|postgres|mysql|sqlite|mssql|mongodb|dynamodb|convex|other>" }
  },
  "db": {
    "kind": "<postgres|mysql|sqlite|mssql|mongodb|dynamodb|convex|other>",
    "ssot": "<none|repo-prisma|database|convex>"
  },
  "skills": {
    "packs": ["workflows"]
  },
  "features": {}
}
```

Rule: if `db.ssot` is `convex`, choose `"layout": "single"`.

**Packs auto-recommendation**:
- Always: `workflows`
- If `backend.enabled`: `backend`
- If `frontend.enabled`: `frontend`
- If needs standards: `standards`

**Stage B validation**:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

---

## Phase 4: Feature Recommendations

| Condition | Feature to enable |
|-----------|-------------------|
| API/DB/BPMN contracts needed | `contextAwareness` |
| `db.ssot != "none"` | `database` + `contextAwareness` |
| Frontend with UI SSOT | `ui` |
| Strict env var contract | `environment` |
| Containerization | `packaging` |
| Multi-environment deploy | `deployment` |
| Automated changelog | `release` |
| Metrics/logging/tracing | `observability` |

**Feature decision prompts**:

- **contextAwareness**: "Do you have API contracts, DB schemas, or BPMN workflows to track?" (`db.ssot != none` requires this to be enabled)
- **database**: "Does DB schema need SSOT management?" (requires `db.ssot != none`; also requires `contextAwareness`; use `convex` when Convex owns schema + functions)
- **packaging**: "Will you produce container images?"
- **deployment**: "Deploy to multiple environments (dev/staging/prod)?"
- **release**: "Need automated changelog/versioning?"
- **observability**: "Need metrics/logging/tracing contracts?"
- **ui**: "Need stable UI tokens/contract SSOT?"
- **environment**: "Need strict env var contract?"

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
```

---

## Phase 5: Configuration + Apply

### Languages with templates

For TypeScript, Go, C/C++, etc., `apply` generates configs automatically.

### Languages without templates (LLM-generated)

**Python** (`pyproject.toml`):
```toml
[project]
name = "{{project.name}}"
version = "0.1.0"
requires-python = ">=3.11"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 88
```

**Java (Gradle)**:
```kotlin
// build.gradle.kts
plugins { java; application }
group = "com.example"
version = "0.1.0-SNAPSHOT"
java { toolchain { languageVersion.set(JavaLanguageVersion.of(21)) } }
```

**Rust** (`Cargo.toml`):
```toml
[package]
name = "{{project.name}}"
version = "0.1.0"
edition = "2021"
```

### Apply and approve

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both

# Skill retention (required before Stage C approval)
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs skill-retention --repo-root .
# If deletions are listed, apply them to confirm:
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs skill-retention --repo-root . --apply

# Update root docs (recommended)
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-root-docs --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-root-docs --repo-root . --apply

# Final approval
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

---

## Post-init

**Update root docs** (ask user):
> "Do you want to update README.md and AGENTS.md with project info?"

**Cleanup** (after user confirms init is complete):
```bash
# Archive + remove init/
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init --repo-root . --apply --i-understand --archive
```

---

## Quality Checklist Reference

Before declaring a stage complete, review `templates/quality-checklist.md` for semantic quality checks.

---

## Decision Tree Summary

```
Language selection
- TypeScript/JS -> pnpm
- Python -> poetry
- Go -> go
- Java/Kotlin -> gradle
- Rust -> cargo
- C/C++ -> xmake

Capabilities -> Features
- API/DB/BPMN -> contextAwareness
- db.ssot != none -> database + contextAwareness
- db.ssot == convex -> prefer repo.language in typescript/javascript/react-native
- frontend -> ui
- containerization -> packaging
- multi-env -> deployment
- versioning -> release
```
