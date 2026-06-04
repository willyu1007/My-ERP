# Dev Docs

Persistent task documentation for context preservation across sessions.

## Trigger Conditions

| Condition | Action |
|-----------|--------|
| Complex task (multi-module, multi-session, >2 hours) | Create task bundle |
| Context reset on ongoing work | Read `00-overview.md` first |
| Task paused or handed off | Update docs via `update-dev-docs-for-handoff` |
| Task completed and verified | Archive via `update-dev-docs-for-handoff` with status=done |

## Decision Gate (MUST)

Create a dev-docs task bundle under `dev-docs/active/<task-slug>/` only when the task is **complex** and benefits from context preservation.

### Skip Conditions (fast path)

Do NOT create dev-docs when **any** is true:
- Single-file change (including adjacent tests/docs)
- Trivial fix (`< 30 min`)
- Simple refactor with clear scope (even if it touches multiple folders)

### Create Conditions

Create a dev-docs task bundle when **any** is true:
- Expected duration is `> 2 hours`, or likely to span multiple sessions
- The work will be paused/handed off, archived, or otherwise needs context recovery artifacts
- The change is high-risk or cross-cutting (examples: DB/schema migration, auth/security, CI/CD/infra, multi-service/API boundary changes)

Notes:
- Touching multiple folders (e.g., `src/` + `tests/` + docs) is **not** a sufficient trigger by itself.
- “>= 3 sequential steps with verification” is too common; it is **not** a trigger for dev-docs.

If the user asks for a roadmap/plan before coding:
- If the task meets the Create Conditions above, use `plan-maker` to create `roadmap.md`, then use `create-dev-docs-plan` for the full bundle.
- Otherwise, provide an in-chat plan and do NOT write under `dev-docs/`.

## Coding Gate (MUST)

Before making any code/config changes for a task that meets the Decision Gate:
1. Ensure the task bundle exists under `dev-docs/active/<task-slug>/` (create via `create-dev-docs-plan` if missing).
2. If the work is ambiguous, or the user asked for a plan/roadmap, create `roadmap.md` via `plan-maker` before implementation.
3. During implementation, keep the bundle current:
   - update `00-overview.md` when status changes
   - append to `03-implementation-notes.md` after each phase
   - record every verification run in `04-verification.md` (commands + outcomes)
4. Before pausing, handing off, or finishing, run `update-dev-docs-for-handoff`.

## File Purposes

| File | Contains | Update Frequency |
|------|----------|------------------|
| `roadmap.md` | Macro-level planning: milestones, scope, risks, rollback | On initial planning |
| `00-overview.md` | Goal, non-goals, current status | On status change |
| `01-plan.md` | Phases, steps, acceptance criteria | On scope/phase change |
| `02-architecture.md` | Boundaries, interfaces, key risks | On design decision |
| `03-implementation-notes.md` | What changed, why, and open issues (actionable TODOs) | After each phase |
| `04-verification.md` | Checks run and results | After each check |
| `05-pitfalls.md` | Resolved failures, dead ends, historical lessons (not current issues) | After issue is resolved |

## AI Instructions

### On Context Reset

1. Read `dev-docs/active/<task-slug>/00-overview.md`
2. Read `01-plan.md`
3. Read `05-pitfalls.md` (scan the `do-not-repeat` summary first)
4. Consult other files as needed

### During Work

- Update `00-overview.md` status field on state change
- Append to `03-implementation-notes.md` after each phase
- Record all verification runs in `04-verification.md`
- Record pitfalls in `05-pitfalls.md` after resolving a significant error/bug/dead-end (historical lessons, not current issues):
  - MUST include: symptom, root cause, what was tried, fix/workaround, and a prevention note

### Workflows

| Workflow | Use When |
|----------|----------|
| `create-dev-docs-plan` | Starting new complex task |
| `update-dev-docs-for-handoff` | Pausing, resuming, handing off, or completing |

### Project Governance Integration

If the repository uses a project hub (`.ai/project/<project>/`), keep the hub in sync with task changes:

| Event | Action |
|-------|--------|
| Task bundle created | Run `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` to register the task |
| Task status changed | Run `sync --apply` to propagate the new status to the registry |
| Task archived | Run `sync --apply` to update the registry (status becomes `archived`) |

Notes:
- `sync --apply` is idempotent; safe to run after any task change.
- If the project hub is not initialized, sync will prompt you to run `init` first.
- For full project governance details, see `.ai/project/AGENTS.md`.

### Archive Rules

When task status changes to "done" and all verification passes:
1. Move `dev-docs/active/<task-slug>/` to `dev-docs/archive/<task-slug>/`
2. This is handled by `update-dev-docs-for-handoff` when status=done

## Skip Conditions

Do NOT create dev docs for:
- Single-file changes
- Trivial fixes (<30 min)
- Simple refactors with clear scope
