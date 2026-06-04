# Procedure: Run Newman (local + CI)

**Base (references):** `.ai/skills/testing/test-api-postman-newman/reference/`

## Goal
Run API test suites via Newman with:
- explicit environment selection
- reproducible commands
- machine-readable artifacts for CI

## Inputs (collect before edits)
- Which collection and/or folder to run
- Which environment config to use
- Where secrets come from (CI secrets / local env vars)

## Steps
1) **Choose scope**
   - Whole collection (regression):
     - run the collection file
   - Folder-only (smoke):
     - `--folder "<folder name>"`

2) **Select environment**
   - Use `-e <env.json>` for non-secret config.
   - Inject secrets at runtime:
     - `--env-var "token=$API_TOKEN"` (example)
   - Avoid putting secrets in env JSON.

3) **Set timeouts intentionally**
   - If your API is slow in CI, increase timeouts with a clear rationale.
   - Keep timeouts bounded to avoid hung pipelines.

4) **Emit artifacts under `artifacts/newman/`**
   - JUnit XML is recommended for CI.
   - If your CI supports HTML/JSON summaries, export them too.

5) **Use exit codes correctly**
   - Newman exits non-zero on failed assertions; CI should treat that as test failure.
   - Differentiate infra failures (DNS, connection) in the failure summary when possible.

## Outputs
- CLI output
- `artifacts/newman/` reports

## Required verification
- Run a smoke scope first:
  - `npx newman run ... --folder "smoke"`
- Then run full regression if needed:
  - `npx newman run ...`

## Boundaries
- Do not run destructive suites on PRs unless gated and isolated.
- Do not print secrets into CI logs.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| All requests timeout | Wrong baseUrl or network issue | Verify URL and connectivity |
| `--env-var` not working | Syntax error | Use `--env-var "key=value"` with quotes |
| Folder not found | Case mismatch or typo | Check exact folder name in collection |
| Reporter output missing | Wrong path or permissions | Ensure output directory exists |

### Common Issues

**1. SSL certificate errors**
- Use `--insecure` flag for self-signed certs in dev
- Better: add cert to trust store

**2. Newman hangs on large collection**
- Add `--timeout-request 30000` to limit per-request time
- Use `--delay-request 100` to prevent rate limiting

**3. Exit code 0 despite failures**
- Verify Newman version (older versions had bugs)
- Check that tests actually have assertions (not just console logs)
