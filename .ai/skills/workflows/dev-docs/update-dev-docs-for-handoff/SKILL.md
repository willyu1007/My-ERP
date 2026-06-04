---
name: update-dev-docs-for-handoff
description: Update an existing dev-docs task bundle with progress, decisions, pitfalls, and verification evidence to enable clean handoff, context recovery, or archival; triggers: handoff/update task docs/context reset/archive.
---

# Update Dev Docs for Handoff

## Purpose
Keep task documentation current so another engineer (or future you) can understand what was done, why, and how to verify or continue work.

## When to use
Use this skill when:
- A task is paused and will be resumed later
- You are handing off work to another contributor
- You are about to compress context or close a long-running thread
- A refactor changed the plan and decisions must be recorded
- A task is completed and ready to archive

If no task bundle exists yet, use `create-dev-docs-plan` first.

## Inputs
- Task directory (e.g., `dev-docs/active/<task-slug>/`)
- Current progress summary
- Key decisions and tradeoffs
- What remains to be done
- Verification status (what was run, what passed/failed)

## Outputs
- Updated task docs:
  - progress summary
  - “what changed” notes
  - updated plan (if needed)
  - verification checklist and current status
  - pitfalls / do-not-repeat notes (if any)

## Steps
1. Update `00-overview.md`:
   - current status (`planned | in-progress | blocked | done`)
   - any scope changes
   - the next concrete step
2. Update `01-plan.md`:
   - mark completed milestones
   - re-sequence remaining tasks if needed
3. Update `02-architecture.md`:
   - record new interfaces and decisions
   - record any migration/rollout implications
4. Update `03-implementation-notes.md`:
   - what files/modules changed (high level)
   - non-obvious decisions and rationale
   - open issues requiring follow-up action (current state, actionable TODOs)
5. Update `04-verification.md`:
   - record what checks were run (commands)
   - record outcomes (pass/fail + next actions)
6. Update `05-pitfalls.md`:
   - append resolved failures and dead ends (historical lessons, not current issues)
   - keep the do-not-repeat summary current (fast scan for future contributors)
7. If status is `done` and verification is complete:
   - propose moving `dev-docs/active/<task-slug>/` to `dev-docs/archive/<task-slug>/`
   - obtain approval before moving

## Verification
- [ ] Task status is clearly documented (`planned | in-progress | blocked | done`)
- [ ] Completed milestones are marked in the plan
- [ ] Implementation notes capture what changed and why
- [ ] Verification section records commands run and outcomes
- [ ] `05-pitfalls.md` is updated for any important failures and the summary is current
- [ ] Handoff docs are sufficient for another contributor to continue
- [ ] No secrets or credentials in documentation
- [ ] If archived: task moved to `dev-docs/archive/` after approval

## Boundaries
- MUST NOT include secrets, credentials, or sensitive data in handoff docs
- MUST NOT delete or overwrite previous decisions without explanation
- MUST NOT mark tasks as complete without recording verification status
- MUST NOT delete prior entries from `05-pitfalls.md` (append-only; mark resolved/superseded instead)
- MUST obtain approval before moving/archiving directories
- SHOULD NOT leave undocumented “tribal knowledge” that blocks the next contributor
- SHOULD be specific about what works, what is broken, and what to do next

## Reader-test handoff check (borrowed)

Before considering the handoff complete, ensure a fresh reader can answer:
- What changed?
- What is the current status?
- What are the next 3 actions (with commands + file paths)?
- How do we verify success?

If any of these require "tribal knowledge," add it to `handoff.md` or `03-implementation-notes.md`.

## Included assets
- Templates: `./templates/handoff-checklist.md`
- Examples: `./examples/` includes a sample handoff update.
