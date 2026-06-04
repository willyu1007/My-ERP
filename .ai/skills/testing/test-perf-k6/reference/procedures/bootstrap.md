# Procedure: Bootstrap k6 perf testing in a repo

**Base (references):** `.ai/skills/testing/test-perf-k6/reference/`

## Goal
Bootstrap k6 testing with:
- versioned scripts stored in-repo
- standard env var inputs (base URL, tokens)
- JSON summary exported to `artifacts/k6/`
- a CI-friendly command usable for gating

## Inputs (collect before edits)
- Where perf tests should live (repo root vs service folder)
- Target environment(s) and base URL(s)
- Auth strategy (token injection vs programmatic token fetch)
- Which endpoints are in scope for smoke vs load tests

## Steps
1) **Create a predictable directory layout**
   - Recommended:
     - `tests/perf/k6/`
       - `scripts/`
       - `data/` (optional; non-secret)
       - `lib/` (helpers)
   - Keep secrets out of repo.

2) **Decide how k6 is installed**
   - Option A (developer machines): install k6 binary via your OS package manager.
   - Option B (CI-friendly): use Docker image `grafana/k6`.
   - Pick one canonical approach and document it.

3) **Add a baseline script**
   - Create `tests/perf/k6/scripts/smoke.mjs` that:
     - hits one or two endpoints
     - asserts status codes and basic success signals
     - uses env vars for base URL and token

4) **Add standard env var contract**
   - Minimum:
     - `BASE_URL`
     - `API_TOKEN` (if required)
   - Document any required headers or tenant IDs.

5) **Standardize output under `artifacts/k6/`**
   - Use `--summary-export artifacts/k6/summary.json` (recommended).
   - Ensure the directory exists in CI jobs.

6) **Add a single CI-friendly command**
   - Example:
     - `k6 run tests/perf/k6/scripts/smoke.mjs --summary-export artifacts/k6/summary.json`
   - If using Docker:
     - mount the repo and write artifacts to a mounted path.

## Outputs
- `tests/perf/k6/` scripts committed in-repo
- Standard env var contract documented
- Artifacts exported to `artifacts/k6/`

## Required verification
- Run the smoke script against a non-prod environment:
  - `k6 run ... --summary-export artifacts/k6/summary.json`
- Confirm `artifacts/k6/summary.json` exists and includes metrics.

## Boundaries
- Do not run load/stress scenarios without capacity planning.
- Do not store secrets in JS files.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `k6: command not found` | k6 not installed | Install via package manager or use Docker |
| Docker volume mount fails | Path syntax on Windows | Use `/c/path` format or `${PWD}` |
| Env vars not passed to k6 | Wrong syntax | Use `k6 run -e VAR=value` or `__ENV.VAR` |
| Summary JSON empty | Script error or no requests | Check script syntax, verify endpoints reachable |

### Common Issues

**1. k6 Docker permission denied**
- Add user to docker group: `sudo usermod -aG docker $USER`
- Or run with: `docker run --user $(id -u):$(id -g)`

**2. SSL/TLS certificate errors**
- For self-signed certs: `k6 run --insecure-skip-tls-verify`
- Better: add CA cert to trust store

**3. Rate limiting blocks tests**
- Coordinate with platform team for test IP allowlist
- Or reduce VU count for initial smoke tests
