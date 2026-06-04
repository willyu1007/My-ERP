# Optional detailed documentation convention

The reference describes an optional file layout convention for maintaining task-level development documentation alongside the roadmap produced by the plan-maker skill.

## Convention
When a task requires detailed documentation (architecture notes, implementation notes, verification logs), the repository convention is to use a flat structure under the task directory:

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

Notes:
- The plan-maker skill **only** produces `roadmap.md`. The skill does not create or update the other files.
- The detailed bundle is intended to be a long-lived, high-fidelity record for collaboration and handoff.

## Suggested mapping
Use the following mapping to avoid duplicating information:

- `roadmap.md` (macro roadmap) → source for:
  - `00-overview.md`: goal, non-goals, scope, impact
  - `01-plan.md`: milestones, phases, step sequencing, DoD
  - `02-architecture.md`: high-level architecture direction and interfaces (details added during execution)
  - `03-implementation-notes.md`: decisions, deviations, trade-offs, runbooks, links to PRs/commits
  - `04-verification.md`: verification strategy, commands, expected outcomes, evidence

## Guidance
- Keep `roadmap.md` macro-level and executable: phases, deliverables, verification, rollback.
- Push deep technical detail (API signatures, schema evolution, edge cases) into the detailed bundle.
- Record unresolved questions early; update assumptions as soon as they are answered.
