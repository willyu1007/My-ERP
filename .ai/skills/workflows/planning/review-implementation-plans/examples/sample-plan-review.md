# Example: Plan review output

## Plan summary (input)
- Goal: Add a new endpoint to export user data.
- Scope: New route, service method, and a background job.

## Review report

### Must-fix gaps
1) **Verification is not concrete**
   - Issue: plan says "test it" but does not list commands, expected results, or negative cases.
   - Recommendation: add a verification section that includes a reproducible request, a permission-negative test, and a data correctness check.

2) **Privacy considerations missing**
   - Issue: exporting user data can leak PII.
   - Recommendation: define fields included, redaction rules, and logging constraints.

### Should-fix improvements
- Add a rollback/backout plan for the background job.
- Add rate limiting/abuse protection if the endpoint is public-facing.

### Acceptance criteria (suggested)
- Export endpoint returns `200` and a stable schema.
- Unauthorized user receives `403` and no export is produced.
- Export job produces correct data for a known fixture.

### Verification actions (suggested)
- Typecheck/build passes.
- Run integration test: `./scripts/test_export_endpoint.sh` (or equivalent).
- Manual smoke: call endpoint with an authorized identity and confirm output schema.
