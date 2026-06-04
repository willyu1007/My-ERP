# <Task Title> — Roadmap

## Goal
- <One-sentence goal statement>

## Planning-mode context and merge policy
- Runtime mode signal: <Plan | Default | Unknown>
- User confirmation when signal is unknown: <yes | no | not-needed | unavailable>
- Host plan artifact path(s): <path(s) or (none)>
- Requirements baseline: <dev-docs/active/<task>/requirement.md | other path | (none)>
- Merge method: set-union
- Conflict precedence: latest user-confirmed > requirement.md > host plan artifact > model inference
- Repository SSOT output: `dev-docs/active/<task>/roadmap.md`
- Mode fallback used: <non-Plan default applied: yes/no>

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | <chat/notes> | <goal/scope/etc.> | highest | <...> |
| Requirements doc | <path or (none)> | <constraints/use cases> | high | <...> |
| Host plan artifact | <path or (none)> | <seed milestones/phases> | medium | <...> |
| Existing roadmap | <path or (none)> | <update baseline> | medium | <...> |
| Model inference | N/A | <fill gaps only> | lowest | <...> |

## Non-goals
- <Explicitly list what is out of scope>

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: <...>
- Q2: <...>

### Assumptions (if unanswered)
- A1: <assumption> (risk: <low|medium|high>)

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | <topic> | <source A vs source B> | <decision> | <precedence rule used> | <none or action> |

## Scope and impact
- Affected areas/modules: <...>
- External interfaces/APIs: <...>
- Data/storage impact: <...>
- Backward compatibility: <...>

## Consistency baseline for dual artifacts (if applicable)
- [ ] Goal is semantically aligned with host plan artifact
- [ ] Boundaries/non-goals are aligned
- [ ] Constraints are aligned
- [ ] Milestones/phases ordering is aligned
- [ ] Acceptance criteria are aligned
- Intentional divergences:
  - (none)

## Project structure change preview (may be empty)
This section is a **non-binding, early hypothesis** to help humans confirm expected project-structure impact.

Rules:
- Prefer **directory-level** paths by default; use file-level paths only when you have clear evidence.
- Do not guess project-specific paths or interfaces; if you have not inspected the repo, keep `(none)` or use `<TBD>`.
- If unknown, keep `(none)` or use `<TBD>` and add/keep a **Discovery** step to confirm.

### Existing areas likely to change (may be empty)
- Modify:
  - (none)
- Delete:
  - (none)
- Move/Rename:
  - (none)

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - (none)
- New interface(s)/API(s) (when relevant):
  - (none)
- New file(s) (optional):
  - (none)

## Phases
1. **Phase 1**: <name>
   - Deliverable: <what exists when done>
   - Acceptance criteria: <how to know it is done>
2. **Phase 2**: <name>
   - Deliverable: <...>
   - Acceptance criteria: <...>

## Step-by-step plan (phased)
> Keep each step small, verifiable, and reversible.

### Phase 0 — Discovery (if needed)
- Objective: <what you need to learn/confirm>
- Deliverables:
  - <notes, diagrams, list of files>
- Verification:
  - <how you confirm discovery is complete>
- Rollback:
  - N/A (no code changes)

### Phase 1 — <name>
- Objective:
- Deliverables:
  - <...>
- Verification:
  - <tests/checks/acceptance criteria>
- Rollback:
  - <how to revert if this phase causes issues>

### Phase 2 — <name>
- Objective:
- Deliverables:
- Verification:
- Rollback:

## Verification and acceptance criteria
- Build/typecheck:
  - <command(s) or CI job(s)>
- Automated tests:
  - <unit/integration/e2e>
- Manual checks:
  - <smoke test steps>
- Acceptance criteria:
  - <bullet list>

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| <risk> | <low/med/high> | <low/med/high> | <...> | <...> | <...> |

## Optional detailed documentation layout (convention)
If you maintain a detailed dev documentation bundle for the task, the repository convention is:

```
dev-docs/active/<task>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

The roadmap document can be used as the macro-level input for the other files. The plan-maker skill does not create or update those files.

Suggested mapping:
- The roadmap's **Goal/Non-goals/Scope** → `00-overview.md`
- The roadmap's **Phases** → `01-plan.md`
- The roadmap's **Architecture direction (high level)** → `02-architecture.md`
- Decisions/deviations during execution → `03-implementation-notes.md`
- The roadmap's **Verification** → `04-verification.md`

## To-dos
- [ ] Confirm planning-mode signal handling and fallback record
- [ ] Confirm input sources and trust levels
- [ ] Confirm merge decisions and conflict log entries
- [ ] Confirm open questions
- [ ] Confirm phase ordering and DoD
- [ ] Confirm verification/acceptance criteria
- [ ] Confirm rollout/rollback strategy
