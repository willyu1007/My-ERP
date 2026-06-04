---
name: code-review-standards
description: Apply consistent code review standards - covers review scope, feedback quality, approval criteria, and common review patterns.
---

# Code Review Standards

## Purpose

Define standards for effective code reviews that improve code quality, share knowledge, and maintain team velocity.

Goals:
- **Quality gate**: catch bugs, security issues, and design problems early
- **Knowledge sharing**: spread understanding of the codebase across the team
- **Consistency**: maintain coding standards and architectural patterns
- **Velocity**: provide timely, actionable feedback

## When to use

Use the code-review-standards skill when:
- Reviewing pull requests / merge requests
- Preparing code for review (self-review checklist)
- Setting up team review guidelines
- Resolving review disagreements

## Inputs

- Code diff to review
- PR description and context
- Related requirements or design docs (if applicable)
- Team coding standards and conventions

## Outputs

- Review comments with clear, actionable feedback
- Approval/request-changes decision with rationale
- Knowledge transfer notes (if significant patterns discovered)


## Steps
1. Read the change summary and identify the intent, blast radius, and any high-risk areas.
2. Review correctness first (behavior, edge cases, error handling, and failure modes).
3. Review maintainability next (structure, naming, tests, and clarity of intent).
4. Classify feedback by severity (blocker / major / minor / nit) and make each comment actionable.
5. Confirm verification evidence exists (tests, logs, screenshots, or a reproducible manual check), or request it explicitly.

## Review Scope (MUST check)

### Correctness

- Does the code do what it claims to do?
- Are edge cases handled?
- Are error conditions handled appropriately?

### Security

- No hardcoded secrets or credentials
- Input validation present for external data
- No obvious injection vulnerabilities (SQL, XSS, etc.)
- Proper authorization checks

### Performance

- No obvious N+1 queries or unnecessary loops
- Appropriate use of caching/memoization
- No blocking operations in hot paths

### Maintainability

- Code is readable and self-documenting
- Functions/methods have single responsibility
- No unnecessary complexity
- Appropriate abstraction level

### Testing

- New functionality has tests
- Tests cover happy path and key edge cases
- Tests are readable and maintainable

## Feedback Quality Rules (MUST)

### Be Specific

- ❌ "The comment is confusing"
- ✅ "The variable name `x` doesn't convey its purpose. Consider `userCount` or `activeUsers`"

### Be Constructive

- ❌ "The change is wrong"
- ✅ "The approach may cause issues when X happens. Consider using Y pattern instead"

### Distinguish Severity

Use prefixes to clarify feedback importance:
- `[blocker]` - Must fix before merge
- `[suggestion]` - Nice to have, author decides
- `[question]` - Seeking clarification
- `[nit]` - Minor style issue, optional fix

### Provide Context

- Explain **why**, not just **what**
- Link to relevant documentation or examples
- Mention if something is a team convention vs personal preference

## Approval Criteria (SHOULD)

Approve when:
- All blockers are resolved
- Code meets minimum quality bar
- Tests pass and coverage is acceptable
- No security concerns

Request changes when:
- Blockers exist that must be addressed
- Security vulnerabilities identified
- Critical functionality missing or broken

## Self-Review Checklist (Before Requesting Review)

- [ ] Code compiles and tests pass locally
- [ ] PR description explains what and why
- [ ] No commented-out code or debug statements
- [ ] No unrelated changes mixed in
- [ ] Sensitive data removed (secrets, personal info)
- [ ] Documentation updated if needed

## Common Review Patterns

### The "LGTM" Review

- Avoid rubber-stamp approvals
- Even quick reviews should note what was checked

### The Nitpick Storm

- Batch minor issues together
- Mark clearly as `[nit]` or `[suggestion]`
- Don't block on style-only issues

### The Architecture Debate

- Large design discussions belong in design docs, not PR comments
- If significant rework needed, discuss synchronously first

### The Stale Review

- Reviews SHOULD be completed within 1 business day
- If blocked, communicate timeline to author

## Boundaries

- Do NOT approve without actually reading the code
- Do NOT block on personal style preferences that aren't team standards
- Do NOT leave vague feedback without actionable suggestions
- Do NOT let reviews become gatekeeping or power dynamics

## Verification

Review quality checklist:
- Feedback is specific and actionable
- Severity is clearly indicated
- Blockers are justified with reasoning
- Response time is reasonable

## Included assets

None.
