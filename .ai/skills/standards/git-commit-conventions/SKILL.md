---
name: git-commit-conventions
description: Apply consistent Git conventions for commits, branches, and pull requests - covers commit message format, branch naming, and PR best practices.
---

# Git Commit Conventions

## Purpose

Define standards for Git usage that improve traceability, collaboration, and automation.

Goals:
- **Traceability**: link code changes to requirements and issues
- **Readability**: clear history that tells a story
- **Automation**: enable changelog generation and semantic versioning
- **Collaboration**: consistent patterns across the team

## When to use

Use this skill when:
- Writing commit messages
- Creating branches
- Opening pull requests / merge requests
- Reviewing Git history or changelog

## Inputs

- Changes to commit
- Related issue/ticket (if applicable)
- Type of change (feature, fix, refactor, etc.)

## Outputs

- Well-formatted commit messages
- Properly named branches
- Clear, reviewable pull requests

---


## Steps
1. Identify the artifact you are producing or reviewing (commit message, branch name, or pull request).
2. Apply the MUST rules from the relevant sections below (format, required fields, and naming rules).
3. If any required element is missing, propose a corrected version that preserves the original intent.
4. Run the checklist sections as a final pass to catch omissions (tests, screenshots, links, etc.).
5. Record the final text output in a copy/paste-ready form (commit message block, branch name, or PR description template).

## Commit Message Format (MUST)

Use **Conventional Commits** format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Type (required)

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (deps, configs) |
| `ci` | CI/CD changes |
| `revert` | Revert a previous commit |

### Scope (optional)

Module or component affected:
- `feat(auth): add JWT refresh token`
- `fix(api): handle null response`
- `docs(readme): update installation steps`

### Subject (required)

- Use imperative mood: "add feature" not "added feature"
- No capitalization at start
- No period at end
- Max 50 characters

### Body (optional)

- Explain **what** and **why**, not **how**
- Wrap at 72 characters
- Use blank line to separate from subject

### Footer (optional)

- Reference issues: `Fixes #123`, `Closes #456`
- Breaking changes: `BREAKING CHANGE: description`

### Examples

```
feat(auth): add password reset flow

Implement forgot password and reset password endpoints.
Email service integration for sending reset links.

Closes #42
```

```
fix(api): handle null user in profile endpoint

Previously threw 500 when user not found.
Now returns 404 with proper error message.

Fixes #128
```

```
refactor(db): extract query builder utilities

No functional changes. Improves testability
and reduces duplication across repositories.
```

---

## Branch Naming (MUST)

Format: `<type>/<ticket>-<short-description>`

### Examples

- `feat/AUTH-123-password-reset`
- `fix/API-456-null-handling`
- `docs/update-readme`
- `chore/upgrade-deps`

### Rules

- Use lowercase and hyphens (kebab-case)
- Keep description short but meaningful
- Include ticket/issue number when applicable
- Avoid special characters

### Protected Branches

- `main` / `master` - production-ready code
- `develop` - integration branch (if using Git Flow)
- `release/*` - release preparation

---

## Pull Request Standards (MUST)

### Title

Follow commit message format:
- `feat(auth): add password reset flow`
- `fix(api): handle null response`

### Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Change 1
- Change 2

## Related Issues
Fixes #123

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] CI passes

## Screenshots (if UI changes)
[Add screenshots here]

## Checklist
- [ ] Code follows team conventions
- [ ] Self-review completed
- [ ] Documentation updated (if needed)
```

### Size Guidelines

- **Ideal**: < 400 lines changed
- **Maximum**: < 1000 lines (split if larger)
- **Exception**: auto-generated code, migrations

### Review Readiness

Before requesting review:
- [ ] All commits are meaningful (squash WIP commits)
- [ ] Branch is up-to-date with target
- [ ] CI/CD passes
- [ ] Self-review completed

---

## Merge Strategies (SHOULD)

| Strategy | When to use |
|----------|-------------|
| **Squash merge** | Feature branches → keep history clean |
| **Merge commit** | When preserving branch history matters |
| **Rebase** | Keeping linear history in small teams |

### Squash Merge (Recommended)

- Combines all branch commits into one
- Final commit message should follow conventions
- Keeps `main` history clean and readable

---

## Boundaries

- Do NOT force push to protected branches
- Do NOT commit secrets, credentials, or sensitive data
- Do NOT mix unrelated changes in one commit
- Do NOT use vague messages like "fix bug" or "update code"

## Verification

Commit quality checklist:
- Message follows conventional format
- Type accurately describes the change
- Subject is clear and imperative
- Linked issues are referenced
- No sensitive data included

## Included assets

None.
