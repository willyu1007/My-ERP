# Quality Checklist (AI Self-Review)

## Conclusions (read first)

- Use the checklist **before** declaring a stage complete.
- AI MUST answer each question honestly. If any answer is "No", iterate with the user before proceeding.
- The checklist is for **semantic quality**, not structural completeness (use `check-docs` for that).

---

## Stage A: Requirements Quality Checklist

Run this checklist after drafting all Stage A docs, **before** requesting user approval.

### A1. One-line Purpose

- [ ] Does the one-line description clearly state: **what** the project does, **for whom**, and **what outcome** it produces?
- [ ] Can a new team member understand the project's goal in 10 seconds?
- [ ] Is the description free of jargon or internal references?

### A2. User Roles

- [ ] Are all primary users explicitly named (2-5 roles)?
- [ ] Is there at least one explicit **non-user** (who this is NOT for)?
- [ ] Are user roles distinguishable (not overlapping or redundant)?

### A3. MUST Requirements

- [ ] Does each MUST requirement have a **testable** acceptance criterion?
- [ ] Are MUST requirements **independent** (not duplicating each other)?
- [ ] Are there **3-10** MUST requirements (not too few, not too many)?
- [ ] Would a developer know when the requirement is "done"?

### A4. Out-of-Scope (OUT)

- [ ] Are out-of-scope items **explicit** and **specific** (not vague)?
- [ ] Would a stakeholder be surprised by anything in-scope that should be OUT?
- [ ] Is there at least one OUT item (no project can do everything)?

### A5. User Journeys

- [ ] Does each journey have a clear **start trigger** and **end state**?
- [ ] Are **happy path** and at least one **error path** described?
- [ ] Does each journey have **acceptance criteria** (not just a narrative)?
- [ ] Are journeys **user-centric** (not implementation-centric)?

### A6. Constraints

- [ ] Are **hard constraints** (compliance, security, deadlines) explicitly listed?
- [ ] Are **soft constraints** (preferences, nice-to-haves) separated from hard constraints?
- [ ] Are external integrations and their constraints documented?

### A7. Success Metrics

- [ ] Is there at least one **business metric** (revenue, conversion, etc.)?
- [ ] Is there at least one **product metric** (adoption, retention, NPS)?
- [ ] Is there at least one **reliability metric** (uptime, latency, error rate)?
- [ ] Are metrics **measurable** (not "improve user experience")?

### A8. TBD Items

- [ ] Is every TBD item recorded in `risk-open-questions.md`?
- [ ] Does each TBD have: **owner**, **options**, and **decision due date**?
- [ ] Are there no "hidden" TBDs (vague language that hides uncertainty)?

---

## Stage B: Blueprint Quality Checklist

Run the checklist after drafting `project-blueprint.json`, **before** requesting user approval.

### B1. Consistency with Stage A

- [ ] Does `project.name` match the project name in `requirements.md`?
- [ ] Does `project.description` match the one-line purpose?
- [ ] Do `project.primaryUsers` match the user roles in requirements?

### B2. Capability Decisions

- [ ] Is every `capabilities.*` decision **traceable** to a requirement or constraint?
- [ ] Are there no "guessed" capabilities (everything has a documented reason)?
- [ ] If `database.enabled`, is `database.kind` specified (or explicitly TBD in risk-open-questions)?

### B3. Skill Packs

- [ ] Does `skills.packs` include `workflows` (always required)?
- [ ] Does `skills.packs` match the enabled capabilities?
  - `backend.enabled` -> `backend` pack
  - `frontend.enabled` -> `frontend` pack
  - `database.enabled` -> `data` pack
- [ ] Are there no **extra** packs that don't match any capability?

### B4. Repo Layout

- [ ] Is `repo.layout` decision documented in requirements or NFR?
- [ ] Is `repo.language` consistent with constraints?
- [ ] Is `repo.packageManager` consistent with team preferences (if documented)?

---

## Stage C: Scaffold Quality Checklist

Run the checklist after `apply` command, **before** cleanup.

### C1. Scaffold Structure

- [ ] Does the generated directory structure match `repo.layout`?
- [ ] Are placeholder READMEs meaningful (not just "TODO")?
- [ ] Are no existing files overwritten unexpectedly? (Root `README.md` / `AGENTS.md` updates are opt-in via `update-root-docs`.)

### C2. Skills Sync

- [ ] Does `.ai/skills/_meta/sync-manifest.json` reflect `skills.packs`?
- [ ] Are `.codex/skills/` and `.claude/skills/` wrappers generated?
- [ ] Can you list the enabled skills and verify they match expectations?

### C3. Cleanup Readiness

- [ ] If you plan to delete `init/`: are Stage A docs preserved somewhere (e.g. `docs/project/overview/` via `cleanup-init --archive`)?
- [ ] If you plan to delete `init/`: is `project-blueprint.json` preserved somewhere (e.g. `docs/project/overview/`)?
- [ ] Is `.ai/skills/_meta/sync-manifest.json` preserved?
- [ ] Are you confident the init kit is no longer needed?

---

## How to Use the Checklist

1. After completing each stage, open the checklist.
2. Answer each question honestly (Yes/No).
3. If any answer is **No**:
   - Identify the gap.
   - Discuss with the user.
   - Iterate until the answer becomes Yes.
4. Only proceed to the next stage when **all** answers are Yes.

## Verification

- Stage A: `check-docs --strict` should pass AND the quality checklist should pass.
- Stage B: `validate` should pass AND `review-packs` should be confirmed AND the quality checklist should pass.
- Stage C: `apply` should complete AND `skill-retention` should be confirmed AND the quality checklist should pass.
