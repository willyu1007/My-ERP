---
name: review-implementation-plans
description: Review implementation plans for completeness, feasibility, risks, dependencies, rollout/rollback, and concrete verification before execution; triggers: plan review/design review.
---

# Review Implementation Plans

## Purpose
Improve delivery outcomes by reviewing implementation plans for missing steps, hidden risks, unclear verification, and rollout gaps before execution.

## When to use
Use this skill when:
- A technical plan or design doc is drafted and needs validation
- Work is complex and spans multiple modules/services
- A refactor plan needs review before execution begins
- You want to reduce rework and integration failures

Avoid using this skill when:
- You need a post-incident write-up rather than a pre-execution review
- You only want a quick opinion without producing a structured report

## Inputs
- The plan (goals, scope, steps)
- Constraints (timeline, team, must-not-change areas)
- Known dependencies (services, APIs, schemas, infrastructure)
- Non-functional requirements (performance, security, reliability)
- Rollout context (environments, feature flags, migration windows), if relevant

## Outputs
- A review report with:
  - must-fix gaps (blocking)
  - recommended improvements (should fix)
  - optional suggestions (may fix)
  - explicit acceptance criteria
  - verification plan (commands/checks + expected results)
  - rollout/rollback notes (when applicable)
- A revised plan outline if the original is incomplete

## Review rubric
- Goals/non-goals and scope boundaries
- Dependencies and sequencing
- Data migrations and backward compatibility
- Auth/permissions, security, and privacy
- Failure modes and operational visibility (logging/monitoring)
- Rollout strategy and rollback/backout plan
- Verification quality (automation + manual smoke)

## Steps
1. Restate the plan in your own words:
   - goal
   - scope / non-goals
   - what will change
2. Identify assumptions and missing decision points.
3. Review against the rubric:
   - dependencies and sequencing
   - data migrations and compatibility
   - auth/permissions and security risks
   - operational visibility
   - rollout and rollback
4. Evaluate verification:
   - tests to add or run
   - manual checks
   - expected results
   - negative cases (invalid input, unauthorized)
5. Produce a structured review report:
   - must-fix (blocking)
   - should-fix (important)
   - may-fix (optional)
6. If the plan is incomplete, provide a revised outline and the next concrete steps to complete it.

## Verification
- [ ] Must-fix items are clearly identified and actionable
- [ ] Acceptance criteria are explicit and testable
- [ ] Verification actions include commands/checks + expected outcomes
- [ ] Rollout/rollback is defined for risky changes (migrations, auth, high-traffic)
- [ ] Risks include mitigations (not just a list)

## Boundaries
- MUST NOT approve a plan with undefined verification or success criteria
- MUST NOT ignore auth/permission, privacy, or data migration risk
- MUST NOT omit rollback/backout for high-risk changes
- SHOULD keep feedback concrete (avoid vague “consider X”)
- SHOULD prioritize high-risk gaps over minor style issues

## Included assets
- Templates: `./templates/plan-review-rubric.md`
- Examples: `./examples/` includes a sample plan review output.
