---
name: fix-frontend-runtime-errors
description: Fix frontend runtime errors (console exceptions, blank screens) by capturing repro steps and diagnostics, applying a minimal targeted fix, and verifying user-visible behavior.
---

# Fix Frontend Runtime Errors

## Purpose
Resolve frontend runtime errors (console exceptions, blank screens, broken interactions) with a structured triage and evidence-backed verification.

## When to use
Use this skill when:
- The UI shows a runtime exception in the console
- A page renders blank or crashes after navigation
- A runtime error occurs after a data/backend change
- Async errors are not handled gracefully (unhandled rejections)

## Inputs
- Error message + stack trace (copy/paste)
- Steps to reproduce (route, clicks, input values)
- Environment details (browser, build, feature flags)
- Relevant network logs (redact secrets)

## Outputs
- Root cause analysis (where and why)
- Minimal code fix (and optional improvement suggestions)
- Verification evidence (what was tested and expected outcomes)

## Steps
1. **Reproduce reliably**
   - Confirm the reproduction steps and the exact error.
2. **Capture diagnostics**
   - console error + stack trace
   - failing network request(s) and response shape
   - relevant UI state at time of failure
   - Use the bug report capture template to keep the evidence structured.
3. **Classify the failure mode**
   - rendering error (null/undefined access)
   - data contract mismatch (backend response changed)
   - routing error (missing params)
   - async error handling (promise rejection)
   - environment/build mismatch (stale assets)
4. **Apply a minimal fix**
   - add guards and safe defaults where appropriate
   - correct data mapping at boundaries (normalize inputs)
   - ensure error UI (error boundary or safe fallback) where needed
   - avoid “catch and ignore” patterns
5. **Verify**
   - reproduction steps no longer fail
   - related flows still work
   - loading/error states render correctly
   - no new console errors introduced
6. **Regression prevention (recommended)**
   - add a test (unit/integration/e2e) or a contract assertion near the boundary

## Verification
- [ ] Reproduction steps no longer produce the error
- [ ] Root cause explains the stack trace and observed state
- [ ] Fix is minimal and targeted (no unrelated refactors)
- [ ] Related flows still work correctly
- [ ] Loading states render appropriately
- [ ] Error states render with user-safe messages
- [ ] No new console errors introduced

## Boundaries
- MUST NOT swallow errors without visibility (log/track unexpected failures)
- MUST NOT expose raw error details to end users
- MUST NOT record secrets/tokens in bug evidence
- SHOULD NOT guess at root cause without capturing diagnostics
- SHOULD prefer user-safe error UI plus logging/tracking for unexpected failures

## Included assets
- Templates: `./templates/bug-report-template.md` is a bug report capture format.
- Examples: `./examples/` includes a null/undefined access regression walkthrough.
