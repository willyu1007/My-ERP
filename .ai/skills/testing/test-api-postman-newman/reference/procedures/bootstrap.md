# Procedure: Bootstrap Postman collections + Newman runner

**Base (references):** `.ai/skills/testing/test-api-postman-newman/reference/`

## Goal
Bootstrap API automation with:
- versioned Postman collections stored in-repo
- deterministic tests and environment separation
- a single CI-friendly Newman command
- standardized artifacts under `artifacts/newman/`

## Inputs (collect before edits)
- Where API tests should live (repo root vs service folder)
- Target environments: local/dev/staging (and base URLs)
- Auth strategy: API key / OAuth / session cookie
- Whether tests are read-only or include mutations (create/update/delete)

## Steps
1) **Create a predictable folder layout**
   - Recommended:
     - `tests/api/postman/`
       - `collections/`
       - `environments/`
       - `data/` (fixtures; optional)
   - Keep secrets out of these files.

2) **Export (or create) the baseline collection**
   - Export from Postman as JSON into:
     - `tests/api/postman/collections/<suite>.collection.json`
   - Use folder structure inside the collection:
     - `smoke/`, `regression/`, `auth/`, etc.

3) **Create non-secret environment files**
   - Export environment JSON into:
     - `tests/api/postman/environments/<env>.env.json`
   - Only include non-secret values:
     - `baseUrl`, feature flags, tenant IDs (if non-sensitive)
   - Do not store tokens. Use placeholders and inject via env vars.

4) **Install Newman (CLI runner)**
   - Preferred: local dev dependency
     - `npm i -D newman`
   - Ensure it is runnable:
     - `npx newman --version`

5) **Standardize reporting artifacts**
   - Decide a minimum artifact set:
     - JUnit XML (required for CI)
     - JSON summary (recommended)
   - Standardize output under:
     - `artifacts/newman/`

6) **Add a single CI-friendly command**
   - Example (adapt paths and reporters):
     - `npx newman run tests/api/postman/collections/<suite>.collection.json -e tests/api/postman/environments/<env>.env.json --reporters cli,junit --reporter-junit-export artifacts/newman/junit.xml`
   - If secrets are required:
     - inject via `--env-var "token=$API_TOKEN"` or via Postman variables
     - never commit secret values to JSON.

7) **Add a smoke request + contract tests**
   - Add at least one request that:
     - hits a lightweight endpoint (health/status)
     - asserts status code + a stable response field
   - Keep it fast and stable for PR gating.

## Outputs
- Postman collection(s) stored under `tests/api/postman/collections/`
- Environment file(s) stored under `tests/api/postman/environments/` (non-secret only)
- Deterministic Newman command (local + CI)
- Artifacts under `artifacts/newman/`

## Required verification
- Run the smoke collection against a non-production environment:
  - `npx newman run ...`
- Confirm `artifacts/newman/junit.xml` is created and failures are readable.

## Boundaries
- Do not commit secrets in exported JSON.
- Do not perform destructive operations (delete/patch) on shared environments unless explicitly permitted and isolated.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `newman: command not found` | Not installed | Run `npm i -D newman` or use `npx newman` |
| Collection import fails | Invalid JSON | Validate JSON syntax; re-export from Postman |
| Variables `{{undefined}}` | Missing env file or var | Check `-e env.json` and variable names |
| JUnit report empty | Reporter not specified | Add `--reporters cli,junit --reporter-junit-export path` |

### Common Issues

**1. Collection exported from Postman loses pre-request scripts**
- Ensure you export as "Collection v2.1"
- Check that scripts are in "Tests" or "Pre-request Script" tabs

**2. Environment variables not interpolating**
- Variable names are case-sensitive
- Ensure env file has the variable defined
- Check for typos: `{{baseUrl}}` vs `{{baseURL}}`

**3. Newman runs slower than Postman GUI**
- Newman has no UI overhead but may have different DNS resolution
- Check network latency from CI runner location
