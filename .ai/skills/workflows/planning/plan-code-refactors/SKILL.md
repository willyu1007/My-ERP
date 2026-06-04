---
name: plan-code-refactors
description: Plan code refactors by defining goals/non-goals, mapping dependencies, sequencing phases, and specifying verification and rollback checkpoints; triggers: refactor plan/restructure/rename/move modules.
---

# Plan Code Refactors

## Purpose
Create a refactor plan that reduces risk and avoids breaking builds by sequencing changes, defining checkpoints, and clarifying success criteria.

## When to use
Use this skill when:
- A module/component has grown unmanageable
- You need to reorganize folders or boundaries
- You want to standardize repeated patterns across the codebase
- You are preparing a large dependency or framework upgrade

## Inputs
- The refactor motivation (what pain it addresses)
- Current structure and known pain points
- Constraints (time, risk tolerance, compatibility requirements)
- Verification tools (build, typecheck, tests, lint, e2e)

## Outputs
- A phased refactor plan with explicit checkpoints
- A dependency map for the refactor scope
- A risk register with mitigations
- Acceptance criteria and verification actions per phase
- Rollback strategy (what to revert to if a phase fails)

## Steps
1. Define goals and non-goals.
2. Inventory the scope:
   - files/modules involved
   - external callers
   - integration points
3. Map dependencies and constraints:
   - which modules import/own what
   - build/test constraints
   - naming/boundary conventions to preserve
4. Choose a refactor strategy:
   - extract modules
   - rename/restructure
   - introduce new abstractions
5. Sequence phases:
   - small, buildable increments
   - explicit checkpoints where the codebase is “green”
6. Define verification per phase:
   - commands to run
   - expected outcomes
   - manual smoke checks if needed
7. Define rollback points:
   - last known-green commit
   - what to revert if a phase fails

## Verification
- [ ] Goals and non-goals are explicit
- [ ] Scope and dependencies are documented
- [ ] Plan is phased with buildable increments and checkpoints
- [ ] Verification actions per phase are concrete and reproducible
- [ ] Risks are listed with mitigations
- [ ] Rollback strategy is defined

## Boundaries
- MUST NOT produce a plan without acceptance criteria and verification
- MUST NOT plan a large refactor as a single undifferentiated step
- MUST include rollback points for risky phases
- SHOULD keep the plan portable (avoid hard-coded paths unless required)
- SHOULD separate structural refactors from behavior changes

## Included assets
- Templates: `./templates/phased-refactor-plan.md` provides a phase structure.
- Examples: `./examples/` includes a sample phased plan.
