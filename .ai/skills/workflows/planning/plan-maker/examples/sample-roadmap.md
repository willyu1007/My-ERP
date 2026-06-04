# Add Feature Flag for New Checkout — Roadmap

## Goal
- Introduce a feature flag to safely roll out the new checkout flow to a subset of users, with a clean rollback path.

## Planning-mode context and merge policy
- Runtime mode signal: Plan
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): `host://plan-mode/checkout-rollout-draft` (example)
- Requirements baseline: `dev-docs/active/add-feature-flag-checkout/requirement.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > requirement.md > host plan artifact > model inference
- Repository SSOT output: `dev-docs/active/add-feature-flag-checkout/roadmap.md`
- Mode fallback used: non-Plan default applied: no

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | planning thread notes | rollout guardrails and success metrics | highest | User asked for fast rollback within minutes |
| Requirements doc | `dev-docs/active/add-feature-flag-checkout/requirement.md` | scope boundaries and constraints | high | Explicitly excludes payment provider changes |
| Host plan artifact | `host://plan-mode/checkout-rollout-draft` | initial phase breakdown | medium | Used as first-pass draft |
| Existing roadmap | (none) | N/A | medium | New task |
| Model inference | N/A | fill missing risk rows | lowest | Used only where no explicit source existed |

## Non-goals
- Rewrite the checkout architecture
- Change payment provider integrations

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: Which feature-flag system should be used (existing internal service vs third-party)?
- Q2: What are the success metrics for ramping to 100% (conversion, error rate, latency)?

### Assumptions (if unanswered)
- A1: We already have a feature-flag provider and client library available in the codebase (risk: medium)

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | Rollout start percentage | Host artifact: 5% start; requirements doc: 1% start | Start at 1% | `requirement.md` outranks host artifact | Reconfirm after first canary window |
| C2 | Monitoring metric set | Host artifact omitted latency; user requested latency tracking | Include latency in go/no-go gate | User-confirmed instruction has highest precedence | Add dashboard owner in execution docs |

## Scope and impact
- Affected areas/modules: checkout UI, checkout API entry points
- External interfaces/APIs: none (flagged behavior only)
- Data/storage impact: minimal (flag evaluation only)
- Backward compatibility: old checkout remains default until ramped

## Consistency baseline for dual artifacts (if applicable)
- [x] Goal is semantically aligned with host plan artifact
- [x] Boundaries/non-goals are aligned
- [x] Constraints are aligned
- [x] Milestones/phases ordering is aligned
- [x] Acceptance criteria are aligned
- Intentional divergences:
  - Rollout starts at 1% (requirements baseline) instead of host draft 5%

## Project structure change preview (may be empty)
This section is a non-binding, early hypothesis to align expected project-structure impact.

### Existing areas likely to change (may be empty)
- Modify:
  - `frontend/checkout/` — gate routing + UI behind the flag
  - `backend/checkout/` — gate server-side entry points behind the flag
- Delete:
  - (none)
- Move/Rename:
  - (none)

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - `shared/feature-flags/` — shared flag evaluation helpers
- New interface(s)/API(s) (when relevant):
  - `FeatureFlagClient` — `shared/feature-flags/` — unify flag evaluation call sites
- New file(s) (optional):
  - `shared/feature-flags/checkout-flags.ts` — checkout-related flag keys and helpers

## Milestones
1. **Milestone 1**: Flag scaffolding exists
   - Deliverable: flag created + client wiring + default OFF behavior
   - Acceptance criteria: no behavior change when flag is OFF; builds/tests green
2. **Milestone 2**: New checkout behind flag
   - Deliverable: routing + UI + API switches are flag-controlled
   - Acceptance criteria: can enable flag for a test cohort; smoke tests pass
3. **Milestone 3**: Rollout controls and monitoring
   - Deliverable: ramp plan + dashboards/alerts
   - Acceptance criteria: clear rollback procedure; monitoring confirms stability

## Step-by-step plan (phased)

### Phase 0 — Discovery
- Objective: Confirm existing flag provider and integration points
- Deliverables:
  - List of current flag usage locations
  - Decision: flag key/name + rollout strategy
- Verification:
  - Confirm flag can be evaluated in both frontend and backend
- Rollback:
  - N/A

### Phase 1 — Flag scaffolding
- Objective: Create the flag and wire evaluation
- Deliverables:
  - Feature flag defined with default OFF
  - Minimal wiring to evaluate the flag where routing occurs
- Verification:
  - Existing checkout remains unchanged with flag OFF
  - Unit tests for flag evaluation paths
- Rollback:
  - Revert wiring commit; flag can remain unused

### Phase 2 — Gate the new checkout
- Objective: Ensure all user-visible switches are flag-controlled
- Deliverables:
  - Conditional routing to new checkout when flag ON
  - Safe fallback to old checkout on error
- Verification:
  - Smoke test old checkout (flag OFF)
  - Smoke test new checkout (flag ON)
  - Error handling validated
- Rollback:
  - Disable flag globally; revert conditional routing if needed

### Phase 3 — Rollout and monitoring
- Objective: Ramp safely with metrics and rollback
- Deliverables:
  - Rollout schedule (1% → 10% → 50% → 100%)
  - Monitoring plan and alert thresholds
- Verification:
  - Ramp steps have go/no-go criteria
  - On-call/rollback steps documented
- Rollback:
  - Immediate flag disable; revert deployments if systemic issues

## Verification and acceptance criteria
- Automated tests: unit + integration relevant to checkout routing
- Manual checks: end-to-end purchase flow smoke test
- Acceptance criteria:
  - No regression in conversion/error rate at each ramp step
  - Rollback can be executed within minutes

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| Flag provider not available on backend | medium | high | add backend flag client or proxy | integration test | disable flag / revert |
| Partial gating causes inconsistent state | low | high | centralize routing decision | e2e tests | disable flag |

## Optional detailed documentation layout (convention)
If a detailed bundle is required, create:

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

## To-dos
- [ ] Confirm flag system and rollout capability
- [ ] Confirm success metrics and dashboards
- [ ] Confirm rollout schedule and owners
