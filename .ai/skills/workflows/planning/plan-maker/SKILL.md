---
name: plan-maker
description: Create a goal-aligned macro-level roadmap (dev-docs/active/<task>/roadmap.md) by asking clarifying questions when needed; planning only (no code changes); strong signal words: make plan/roadmap/implementation plan.
---

# Plan Maker

## Purpose
Produce a single, goal-aligned macro-level roadmap as a Markdown document that can guide execution without modifying the codebase.

## When to use
Use the plan-maker skill when:
- **Strong trigger**: The user explicitly asks for a saved "roadmap" document/artifact - MUST use the `plan-maker` skill unless the change is trivial (`< 30 min`)
- The user asks for a plan/milestones/implementation plan before coding
- The user asks to "align thinking first" or "clarify direction" before planning
- The task is large/ambiguous and benefits from staged execution and verification
- You need a roadmap artifact saved under `dev-docs/active/` for collaboration and handoff

Avoid the skill when:
- The change is trivial (<30 min) and does not benefit from staged execution/verification
- A roadmap already exists and only minor edits are needed (update the existing roadmap instead)

## Inputs
- Task goal (required)
  - If the goal is ambiguous or missing critical constraints, you MUST ask clarifying questions before drafting the roadmap.
- Requirements source (optional):
  - **Existing document**: User provides a path to an existing requirements document; plan-maker reads and extracts key points
  - **Interactive collection**: Collect requirements through Q&A dialogue with the user
  - **Both**: Read existing document AND supplement with interactive Q&A
- Requirements alignment mode (optional):
  - If user requests "align thinking first" or "clarify direction", generate requirements document to `dev-docs/active/<task>/requirement.md` before creating roadmap
  - See `./templates/requirement.md` for the requirements document template

## Outputs
- `dev-docs/active/<task>/roadmap.md` (always)
  - `<task>` is a short filesystem-safe slug derived from the goal and confirmed with the user.
- `dev-docs/active/<task>/requirement.md` (optional, when requirements alignment mode is active)
  - Generated when user requests "align thinking first" or provides existing requirements document
- Host plan-mode artifact(s) (optional, read-only input)
  - May exist in the host runtime (Cursor/Codex/other planning surfaces); treat as seed input only and do not overwrite from plan-maker.

## Plan-mode interoperability
- Runtime signal contract:
  - Planning mode is active only when a reliable runtime signal exists (for example, `collaboration_mode=Plan`) or the user explicitly confirms it.
  - If the signal is missing, ask the user once.
  - If the signal remains unavailable and user confirmation is unavailable, continue as non-Plan mode and record that assumption.
- Seed artifact discovery order:
  1. User-provided artifact paths
  2. Runtime-provided host plan artifact paths
  3. `dev-docs/active/<task>/requirement.md` (when present or generated in Phase 0)
  4. Existing `dev-docs/active/<task>/roadmap.md` (update flow only)
- Merge and conflict policy (required):
  - Build the roadmap draft using set-union over available seed artifacts.
  - Resolve conflicts using the strict precedence:
    1. Latest user-confirmed instruction
    2. `requirement.md`
    3. Host plan-mode artifact
    4. Model inference
  - If conflicts remain unresolved, record them under roadmap open questions/assumptions and do not silently drop them.
- Consistency baseline for dual artifacts:
  - If both host plan artifact and roadmap exist, keep semantic consistency for goal, boundaries, constraints, milestone/phase ordering, and acceptance criteria.
  - `dev-docs/active/<task>/roadmap.md` remains repository SSOT.

## Steps

### Phase 0 - Requirements alignment (optional, triggered by user request)

0. **Check for requirements alignment request**:
   - If user asks to "align thinking first" or "clarify direction", or provides an existing requirements document:
     - Proceed to step 0a
   - Otherwise, skip to step 1

0a. **Requirements source handling**:
   - If user provides an existing document path:
     - Read the document and extract: goal, use cases, boundaries, constraints
     - Summarize key points and confirm understanding with user
   - If user requests interactive collection:
     - Ask structured questions to collect:
       - Core goal (1 sentence)
       - Main use cases (2-5)
       - Boundaries / non-goals
       - Key constraints
     - Summarize collected requirements and confirm with user

0b. **Generate requirements document** (if alignment mode is active):
   - Propose `<task>` slug (if not yet confirmed)
   - Save aligned requirements to `dev-docs/active/<task>/requirement.md`
   - Confirm with user: "Requirements documented. Proceed to roadmap creation?"
   - If user confirms, continue to step 1
   - If user wants to refine, iterate on requirements document

### Phase 1 - Roadmap creation (core workflow)

1. Detect planning-mode context.
   - Use runtime signal when available; otherwise ask user once.
2. Discover seed artifacts.
   - Follow the required discovery order from the interoperability rules.
3. Restate the goal in one sentence and confirm direction.
4. Identify what is unclear and ask clarifying questions.
   - Ask only what is necessary to align the roadmap to the goal (scope, non-goals, target environment, success criteria, constraints).
   - If the user cannot answer now, record assumptions explicitly and surface the risk.
5. Propose a `<task>` slug and confirm the `<task>` slug with the user.
   - Use kebab-case; avoid dates unless requested.
   - If already confirmed in Phase 0, skip step 5.
6. Draft the roadmap using `./templates/roadmap.md`.
   - Keep the roadmap macro-level: phases, milestones, deliverables, verification, risks, rollback.
   - Always include the **Project structure change preview (may be empty)** section from the template:
     - Use the section as a **non-binding alignment aid** (humans confirm expected impact early; execution may differ).
     - Prefer **directory-level** paths by default; use file-level paths only when you have clear evidence.
     - Do not guess project-specific paths or interfaces; if you have not inspected the repo, keep `(none)` or use `<TBD>`.
     - If unknown, keep `(none)` or use `<TBD>` and add/keep a **Discovery** step to confirm.
   - Include input trace and merge/conflict decisions in the roadmap draft.
   - If plan-mode artifacts are available, use them as first-pass inputs and merge by union.
   - Apply strict conflict precedence: user-confirmed > requirement.md > host artifact > inference.
   - If planning-mode signal is unavailable and user confirmation is unavailable, proceed as non-Plan mode and record the assumption.
   - Only include specific file paths/APIs elsewhere when you have evidence; otherwise add a discovery step.
   - Include an "Optional detailed documentation layout (convention)" section that declares the expected file layout under `dev-docs/active/<task>/` without creating those files.
7. Save the roadmap to `dev-docs/active/<task>/roadmap.md`.
8. Return a short handoff message to the user:
   - confirmed goal
   - where the roadmap was saved
   - the next 3 actions to start execution (without executing them)

### Phase 2 - dev-docs linkage (conditional)

9. **Evaluate dev-docs Decision Gate**:
   - Check if task meets any of these criteria:
     - Expected duration > 2 hours, or likely to span multiple sessions
     - The work will be paused/handed off, or the user explicitly needs context recovery artifacts
     - The change is high-risk or cross-cutting (e.g., DB/schema migration, auth/security, CI/CD/infra, multi-service/API boundary changes)
   - If criteria are met:
     - Inform user: "The task qualifies for a full dev-docs bundle for context preservation."
     - Ask: "Would you like to create the complete documentation bundle now?"
     - If user confirms, **trigger `create-dev-docs-plan` skill** with the roadmap as input
   - If criteria not met:
     - Note in the handoff message that roadmap is sufficient for the current task

## Verification
- [ ] Goal is restated and (where needed) confirmed with the user
- [ ] Ambiguities are resolved or recorded as explicit open questions/assumptions
- [ ] (If alignment mode) Requirements document saved to `dev-docs/active/<task>/requirement.md`
- [ ] (If alignment mode) User confirmed requirements understanding before roadmap creation
- [ ] Planning-mode signal was checked; if missing, user was explicitly asked once before assuming non-Plan mode
- [ ] Seed artifact discovery order was applied and recorded
- [ ] Merge/conflict resolution applied strict precedence (user-confirmed > requirement.md > host artifact > inference)
- [ ] Unresolved conflicts are preserved as open questions/assumptions
- [ ] (If dual artifacts) Goal, boundaries, constraints, milestones/phases, and acceptance criteria are semantically consistent
- [ ] Roadmap includes milestones/phases and per-step deliverables
- [ ] Roadmap includes "Project structure change preview" section (may be empty)
- [ ] Roadmap defines verification/acceptance criteria and a rollback strategy
- [ ] Roadmap is saved to `dev-docs/active/<task>/roadmap.md`
- [ ] dev-docs Decision Gate evaluated; user prompted for full bundle if criteria met
- [ ] No application/source/config files were modified

## Boundaries
- MUST NOT modify application/source code, project configuration, or database state
- MUST ask clarifying questions when the goal or constraints are ambiguous
- MUST NOT invent project-specific facts (APIs, file paths, schemas) without evidence
- **MUST use the `plan-maker` skill when the user explicitly asks for a saved "roadmap" document/artifact** (strong trigger)
- MUST NOT assume planning mode unless a runtime signal exists or the user explicitly confirms planning mode
- MUST default to non-Plan mode when no reliable signal or user confirmation is available, and record this assumption
- MUST treat `dev-docs/active/<task>/roadmap.md` as repository SSOT
- MUST apply conflict precedence: user-confirmed > requirement.md > host plan artifact > inference
- If the user asks to implement immediately but the task is non-trivial, produce the roadmap first, then ask for confirmation to proceed with execution in a follow-up turn.
- If the task meets the dev-docs Decision Gate, **MUST prompt user** whether to continue with `create-dev-docs-plan`
- If user confirms dev-docs bundle creation, **MUST trigger `create-dev-docs-plan` skill**
- SHOULD keep the roadmap macro-level; deep design details belong in separate documentation artifacts
- SHOULD NOT include secrets (credentials, tokens, private keys) in the roadmap
- SHOULD preserve semantic consistency across dual artifacts while documenting intentional divergences
- PRODUCES macro-level roadmaps: milestones, phases, scope, impact, risks, rollback strategy
- PRODUCES requirements documents (when alignment mode is active)
- DOES NOT produce implementation-level documentation (architecture diagrams, step-by-step code guides, pitfalls logs)
- The roadmap is a planning artifact; detailed implementation docs belong to a separate documentation bundle

## Included assets
- Templates:
  - `./templates/roadmap.md` (roadmap document)
  - `./templates/requirement.md` (requirements alignment document)
- Reference: `./reference/detailed-docs-convention.md` (optional file layout convention)
- Example: `./examples/sample-roadmap.md`
