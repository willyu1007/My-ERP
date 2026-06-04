---
name: create-dev-docs-plan
description: Create a structured dev-docs task bundle (overview/plan/architecture/notes/verification/pitfalls) with clear scope, acceptance criteria, and handoff-ready artifacts; triggers: task docs/dev-docs/handoff/context recovery.
---

# Create Dev Docs Plan

## Purpose
Generate a structured, repeatable “task documentation bundle” so implementation work has clear scope, steps, and verification, and can be handed off cleanly.

## When to use
Use the `create-dev-docs-plan` skill when:
- Starting a non-trivial task or project (not a one-off minor change)
- Work spans multiple modules/services
- You need a shared plan for multiple contributors (collaboration/handoff)
- You want a consistent handoff artifact for later context recovery

## Quick decision gate (MUST)
Use the `create-dev-docs-plan` skill when **any** is true:
- Expected duration is `> 2 hours`, or likely to span multiple sessions
- You need explicit handoff/context recovery documentation
- The change is high-risk or cross-cutting (examples: DB/schema migration, auth/security, CI/CD/infra, multi-service/API boundary changes)

Notes:
- Touching multiple folders (e.g., `src/` + `tests/` + docs) is **not** a sufficient trigger by itself.

Skip the `create-dev-docs-plan` skill when **any** is true:
- Trivial fix (`< 30 min`)
- Single-file change (including adjacent tests/docs)
- Simple refactor with clear scope (even if the change touches multiple folders)

## Inputs
- Task name (short, kebab-case recommended)
- High-level goal and success criteria
- Constraints (deadline, non-goals, areas that must not change)
- Known dependencies (APIs, data models, infra)

## Outputs
A new task directory with a standard set of docs, e.g.:

```
dev-docs/active/<task-slug>/
  roadmap.md              # Macro-level planning (plan-maker, optional)
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

(Adjust directory naming to match your repository conventions if different.)

## Rules
- The overview MUST state the goal and non-goals.
- The plan MUST include phases and acceptance criteria.
- The architecture doc MUST capture boundaries and contracts.
- Verification MUST be concrete (commands/checks, expected results).
- The task bundle MUST include `05-pitfalls.md` and the pitfalls log MUST be updated when failures are resolved (historical lessons, append-only).
- Avoid embedding secrets or real credentials.
- For tasks that meet the Decision Gate, the bundle MUST be created before implementation work begins (before code/config changes).

## Steps
1. Create `dev-docs/active/<task-slug>/`.
2. Write `00-overview.md`:
   - problem statement
   - status (`planned | in-progress | blocked | done`) + next concrete step
   - goal
   - non-goals
   - high-level acceptance criteria
3. Write `01-plan.md`:
   - phases
   - step order
   - risks and mitigations
4. Write `02-architecture.md`:
   - boundaries
   - interfaces/contracts
   - data migrations (if any)
5. Write `03-implementation-notes.md`:
   - decisions made
   - deviations from plan (with rationale)
   - open issues requiring follow-up action (current state, actionable TODOs)
6. Write `04-verification.md`:
   - automated checks
   - manual smoke checks
   - rollout/backout notes (if needed)
7. Write `05-pitfalls.md`:
   - a short `do-not-repeat` summary (fast scan for future contributors)
   - an append-only log of resolved failures and dead ends (historical lessons, not current issues)

## Verification
- [ ] Task directory follows the standard layout (`00-overview.md`, `01-plan.md`, etc.)
- [ ] Overview clearly states goals and non-goals
- [ ] Plan includes phases with acceptance criteria
- [ ] Architecture captures boundaries and contracts
- [ ] Verification has concrete commands/checks and expected results
- [ ] `05-pitfalls.md` exists and is structured for fast scanning + append-only updates
- [ ] No secrets or real credentials are embedded
- [ ] Documentation is sufficient for handoff to another contributor

## Boundaries
- MUST NOT embed secrets or real credentials in docs
- MUST NOT skip verification section (must be concrete and testable)
- MUST NOT create plans without acceptance criteria
- SHOULD NOT deviate from the standard directory layout without justification
- SHOULD keep overview high-level (implementation detail belongs elsewhere)
- PRODUCES implementation-level documentation bundle (overview, plan, architecture, notes, verification, pitfalls)
- DOES NOT produce macro-level roadmaps (milestone definitions, scope/impact analysis, rollback strategies)
- If a macro roadmap exists, use the roadmap as input; the `01-plan.md` here captures step-level execution detail, not phase/milestone planning

## Writing and collaboration tips (borrowed)

To make dev-docs usable for both humans and LLMs:

- Write **purpose + outcome first** in `00-overview.md`.
- Keep paragraphs single-intent; use headings that match the decisions the reader must make.
- Use MUST/SHOULD/MAY for constraints and invariants.
- Add verification commands with expected results (especially in `04-verification.md`).
- Before finalizing, do a quick **reader test**: can a fresh agent answer "what do I do next?" using only the dev-docs bundle?

If dev-docs content is also used for status updates, consider a short **3P (Progress / Plans / Problems)** summary in `handoff.md`.

## Included assets
- Templates:
  - `./templates/00-overview.md`
  - `./templates/01-plan.md`
  - `./templates/02-architecture.md`
  - `./templates/03-implementation-notes.md`
  - `./templates/04-verification.md`
  - `./templates/05-pitfalls.md`
- Examples: `./examples/` includes a minimal task bundle layout.
