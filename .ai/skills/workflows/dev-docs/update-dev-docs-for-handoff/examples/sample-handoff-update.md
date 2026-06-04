# Example: Handoff update (blocked task)

## `00-overview.md` update (sketch)
- Status: blocked
- Blocker: waiting for schema access approval
- Next step: once access is granted, run migrations and re-run verification

## `01-plan.md` update (sketch)
- ✅ Milestone 1: ...
- 🟡 Milestone 2: ... (blocked)

## `05-pitfalls.md` update (sketch)
- Pitfall: integration tests fail if `FOO_API_KEY` is missing
- Prevention: document required env vars + add guardrails in setup scripts

## `04-verification.md` update (sketch)
- ✅ Typecheck/build
- ❌ Integration tests (blocked by missing environment variable)
- Notes: ...
