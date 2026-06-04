---
name: review-code-architecture
description: Review code changes for architectural consistency, correctness risks, security/performance concerns, and verification gaps; produce a prioritized, actionable review report.
---

# Review Code Architecture

## Purpose
Provide a rigorous, structured review of new or modified code to ensure architectural consistency, maintainability, and correct system integration.

## When to use
Use this skill when:
- A feature or endpoint is implemented and needs review
- A refactor changed module boundaries
- Performance, security, or maintainability concerns were raised
- You are preparing code for merge/release

## Inputs
- The set of changed files (diff/PR) and a short feature description
- Any relevant non-functional requirements (performance, security, reliability)
- Existing architectural conventions (layering, module boundaries, style guides)

## Outputs
- A prioritized review report:
  - critical issues (must fix)
  - important improvements (should fix)
  - optional suggestions (may fix)
- Concrete recommendations with rationale
- Verification actions (tests, checks) to confirm fixes

## Review rubric

### 1. Architecture & boundaries
- Are responsibilities separated (UI vs data, controller vs service vs repository)?
- Are dependency directions clean (no forbidden imports)?
- Are abstractions appropriate (not premature, not leaky)?

### 2. API & contracts
- Are input/output shapes explicit and stable?
- Are error responses consistent and predictable?
- Are public module exports minimal and intentional?

### 3. Error handling
- Are errors mapped consistently?
- Are unknown failures logged/tracked?
- Are retries/idempotency considered where needed?

### 4. Security & privacy
- Are auth/permission checks correct and enforced in the right places?
- Are secrets and PII protected (not logged, not exposed to client)?
- Are unsafe dynamic executions avoided (e.g., eval, unsanitized HTML)?

### 5. Performance
- Any obvious N+1 queries, unbounded lists, or heavy renders?
- Is caching/invalidation strategy correct?
- Are slow paths measured or at least bounded?

### 6. Testing
- Are critical business rules tested?
- Are new endpoints covered by integration tests when feasible?
- Are tests deterministic and maintainable?

### 7. Maintainability
- Naming clarity and module structure
- Code duplication vs reuse
- Comments/documentation for non-obvious decisions

## Steps
1. Read the change intent (what problem it solves).
2. Review the diff top-down:
   - contracts and boundaries first
   - then implementation details
3. Identify risks and failure modes.
4. Produce a structured report:
   - use the review report template
   - include evidence pointers (file/line or behavior)
5. Provide verification actions per critical issue.

## Verification
- [ ] All changed files have been reviewed
- [ ] Critical issues are identified and prioritized
- [ ] Recommendations include concrete, actionable steps
- [ ] Security implications are assessed for auth/permission changes
- [ ] Verification actions are defined for each critical issue
- [ ] Review output is structured and reusable

## Boundaries
- MUST NOT approve code without reading and understanding the changes
- MUST NOT skip security review for auth/permission changes
- MUST NOT leave vague feedback without actionable suggestions
- SHOULD NOT block on personal style preferences that are not established standards
- SHOULD focus on correctness and risk before cosmetics

## Included assets
- Templates:
  - `./templates/review-checklist.md`
  - `./templates/review-report.template.md`
- Examples: `./examples/` includes a sample review report.
