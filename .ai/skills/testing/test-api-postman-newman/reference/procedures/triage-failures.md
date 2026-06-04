# Procedure: Triage Newman failures / improve signal

**Base (references):** `.ai/skills/testing/test-api-postman-newman/reference/`

## Goal
Turn a failing API run into:
- a clear classification (contract regression vs test issue vs infra/auth)
- minimal reproduction scope (single folder/request)
- actionable output for developers (what changed and where)

## Inputs (collect before edits)
- Failing request(s) and assertion messages
- Environment (base URL, tenant, token source)
- Newman report artifacts (JUnit/JSON)

## Steps
1) **Classify the failure**
   - **Infra**: DNS, connection refused, TLS, timeout to host
   - **Auth**: 401/403, missing/expired token, wrong scopes
   - **Contract regression**: status/schema/fields changed unexpectedly
   - **Test issue**: brittle assertion, bad data assumptions

2) **Minimize scope**
   - Re-run only the failing folder.
   - If needed, isolate a single request (copy into a scratch folder temporarily).

3) **Validate environment inputs**
   - Confirm `baseUrl` and tenant IDs match the target environment.
   - Confirm secrets were injected (token not empty).

4) **Inspect response samples**
   - For contract regressions:
     - compare old vs new response shape
     - decide whether to update tests or fix API
   - For auth failures:
     - confirm header construction and token refresh path

5) **Reduce brittleness**
   - Replace volatile assertions with stable contract checks.
   - If eventual consistency exists:
     - implement bounded polling (max attempts + sleep) and assert final state

6) **Write a short RCA note**
   - Symptom → Root cause → Fix → Follow-ups (e.g., add schema, add seed endpoint)

## Outputs
- A fixed test (or a documented API regression) with clear evidence
- Improved failure messages (assertion text explains what failed)

## Required verification
- Re-run the failing scope after fix:
  - `npx newman run ... --folder "<folder>"`
- Confirm the failure is resolved and signals remain meaningful.

## Boundaries
- Do not mask API regressions by removing assertions without replacement.
- Do not leak tokens or sensitive response data in logs or reports.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| 401 Unauthorized | Token expired or missing | Check token injection and expiry |
| 403 Forbidden | Wrong scopes or permissions | Verify test user has required access |
| 500 Internal Server Error | API bug or bad test data | Check API logs, verify request payload |
| Different results each run | Race condition or data dependency | Add explicit data setup/teardown |

### Common Issues

**1. Flaky tests due to data ordering**
- APIs may return arrays in different order
- Sort before comparing or use unordered assertions

**2. Timeout failures in CI only**
- CI network may be slower or have different routing
- Increase `--timeout-request` for CI runs

**3. Cannot reproduce locally**
- Environment differences (URL, auth, data)
- Use exact same env file and injected vars as CI
- Check if CI has VPN or IP allowlist access
