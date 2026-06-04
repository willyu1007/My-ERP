# Procedure: Add/extend a request + tests in a Postman collection

**Base (references):** `.ai/skills/testing/test-api-postman-newman/reference/`

## Goal
Add a request with tests that:
- validate the contract (status + schema + key fields)
- avoid brittle assertions
- are runnable in Newman (no manual Postman-only steps)

## Inputs (collect before edits)
- Endpoint + method + expected status codes
- Auth requirements and which variable provides credentials/token
- Required test data and how to set it up (seed vs create)
- Which environment(s) should run this request

## Steps
1) **Place the request in the correct folder**
   - Use collection folders that map to suites and product areas:
     - `smoke/<area>/...`
     - `regression/<area>/...`

2) **Parameterize base URL and identifiers**
   - Use variables:
     - `{{baseUrl}}` for host
     - `{{tenantId}}`, `{{resourceId}}`, etc.
   - Do not hardcode environment-specific values.

3) **Auth setup**
   - If token-based:
     - Store token in an env var at runtime (CI secret)
     - Reference via `{{token}}` or header injection in pre-request script
   - If OAuth:
     - Prefer CI-managed token acquisition (outside Postman) and inject token.

4) **Write tests (contract-focused)**
   - Required checks:
     - status code
     - response is valid JSON (when applicable)
     - presence of stable keys/fields
   - Avoid strict assertions on:
     - timestamps
     - random IDs
     - ordering unless contract specifies order

5) **Optional: basic schema checks**
   - If you maintain JSON schema files, validate key structure.
   - Keep schema checks lightweight (avoid huge schemas that churn).

6) **Data setup/teardown**
   - If you create resources:
     - capture created IDs into variables (e.g., `pm.environment.set('resourceId', ...)`)
     - avoid leaving junk in shared envs; delete when permitted
   - Keep mutations behind an explicit folder/suite (not in smoke).

7) **Make it Newman-safe**
   - Ensure everything runs headlessly:
     - no manual steps
     - no dependency on Postman UI state

## Outputs
- Updated collection JSON committed to repo
- Updated env JSON only if adding non-secret variables

## Required verification
- Run the updated folder only:
  - `npx newman run <collection> -e <env> --folder "<folder name>"`
- Confirm failures clearly show:
  - request name
  - assertion message
  - response snippet if needed

## Boundaries
- Do not store secrets in collection/env JSON.
- Do not add long sleeps; if the API is eventually consistent, implement bounded polling with clear timeouts.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Pre-request script not running | Script syntax error | Check Postman console for errors |
| Variable set in test not available | Async timing or scope issue | Use `pm.environment.set()` correctly |
| JSON parse error in tests | Response not JSON | Add `Content-Type` check before parsing |
| Tests pass in Postman, fail in Newman | Different variable state | Ensure all vars are in env file or injected |

### Common Issues

**1. pm.environment.set() doesn't persist**
- Variables set during run are available only for that run
- For cross-request data, use collection variables: `pm.collectionVariables.set()`

**2. Response body assertion fails randomly**
- API may return different order (arrays)
- Use `pm.expect(array).to.include.members([...])` instead of deep equal

**3. Tests reference undefined variables**
- Check variable scope: environment vs collection vs global
- Use `pm.variables.get()` which checks all scopes
