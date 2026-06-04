# Procedure: Standardize artifacts + reporting in GitLab CI

**Base (references):** `.ai/skills/features/ci/gitlab-ci/reference/`

## Goal
Make CI failures actionable by ensuring:
- artifacts are always retained in a predictable structure
- JUnit reports (when available) are surfaced in GitLab UI
- failures are easy to triage without rerunning locally

## Inputs (collect before edits)
- Which suites can emit JUnit XML today
- Artifact size/retention constraints
- Whether jobs run in parallel and need per-job artifact naming

## Steps
1) **Standardize artifact paths**
   - Ensure suites write to:
     - `artifacts/<suite>/...`

2) **Always retain artifacts**
   - Configure in each job:
     - `artifacts: when: always`
     - `artifacts: paths:`
   - Keep payload size bounded (videos/traces on failure only when possible).

3) **Use GitLab test reports (JUnit)**
   - If a suite emits JUnit:
     - store it under a known path (e.g., `artifacts/<suite>/junit.xml`)
   - Configure:
     - `artifacts: reports: junit: artifacts/<suite>/junit.xml`
   - This lets GitLab show test failures directly in the UI.

4) **Keep logs readable**
   - Ensure your test commands print:
     - suite name
     - failing spec/test names
     - a pointer to artifact path(s)

## Outputs
- Artifacts consistently available under `artifacts/`
- JUnit test reports surfaced in GitLab UI (where available)

## Required verification
- Introduce a known failing test temporarily and confirm:
  - job fails correctly
  - artifacts are still available
  - GitLab UI shows test report failures (if configured)

## Boundaries
- Do not upload secrets in artifacts.
- Do not retain huge artifacts by default; constrain to failures or specific jobs.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Artifacts not retained | `when:` not set to `always` | Add `artifacts: when: always` |
| JUnit report not showing | Wrong path or invalid XML | Verify file exists and is valid JUnit XML |
| Artifacts expired | Short retention period | Increase `expire_in:` value |
| Cannot download artifacts | Job failed before artifact step | Move artifact config to job level |

### Common Issues

**1. Test report shows 0 tests**
- JUnit XML may be malformed
- Check file path matches `reports: junit:` config
- Verify test framework generates valid JUnit format

**2. Artifacts too large**
- Use `artifacts: when: on_failure` for videos/traces
- Exclude unnecessary files with `artifacts: exclude:`
- Compress large directories before upload

**3. Artifacts from parallel jobs conflict**
- Use `artifacts: name:` with job-specific identifier
- Example: `name: "$CI_JOB_NAME-$CI_COMMIT_REF_SLUG"`
