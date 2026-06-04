# Procedure: Standardize artifacts + reporting in GitHub Actions

**Base (references):** `.ai/skills/features/ci/github-actions-ci/reference/`

## Goal
Make CI failures actionable by ensuring:
- artifacts are always uploaded in a predictable structure
- test outputs are machine-readable when possible (JUnit)
- PR reviewers can quickly see “what failed” without rerunning locally

## Inputs (collect before edits)
- Which suites produce JUnit XML today (Playwright/Newman/Cypress can)
- Artifact size constraints and retention policy
- Whether your org allows third-party reporting actions

## Steps
1) **Standardize artifact paths**
   - Ensure all suites write into:
     - `artifacts/<suite>/...`
   - Avoid scattered outputs across the workspace.

2) **Upload artifacts even on failure**
   - In each job, add an upload step guarded with:
     - `if: always()`
   - Upload either:
     - the whole `artifacts/` tree, or
     - `artifacts/<suite>/` per job for smaller payloads.

3) **Prefer machine-readable reports**
   - If your frameworks can emit JUnit XML, do it:
     - Newman: JUnit reporter export
     - Playwright: JUnit reporter output
     - Cypress: JUnit via mocha reporter (if configured)
   - Store under:
     - `artifacts/<suite>/junit.xml` (or a well-known pattern)

4) **Add a GitHub Actions step summary (optional, recommended)**
   - Write a short summary to `$GITHUB_STEP_SUMMARY`:
     - suite name
     - pass/fail
     - path(s) to artifacts (so a developer knows where to look)

5) **Optional: annotate PRs with test reports**
   - If allowed, use a test report action to surface JUnit results.
   - If not allowed, keep upload + summary only.

## Outputs
- Predictable artifacts under `artifacts/`
- CI logs + summaries that point to the right evidence

## Required verification
- Force a known failing test temporarily and confirm:
  - the job fails correctly
  - artifacts are still uploaded
  - summary clearly points to the suite and artifact location

## Boundaries
- Do not upload secrets; ensure artifacts do not contain credentials.
- Do not upload excessively large artifacts by default (videos/traces can be huge); use "on failure" policies where possible.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Artifacts not uploaded | Step ran before artifacts created | Ensure test step runs before upload |
| Upload fails with path error | Directory doesn't exist | Create dir or use `if-no-files-found: warn` |
| Artifacts too large | Videos/traces on all tests | Use "on failure" only for large files |
| Can't find artifacts in UI | Expired or wrong job | Check retention settings and job name |

### Common Issues

**1. "No files were found" warning**
- Ensure test command writes to expected path
- Check path in `actions/upload-artifact` matches output
- Use glob patterns correctly: `artifacts/**/*`

**2. JUnit report not showing**
- Verify file path in test reporter config
- Check file is valid XML
- Some actions need specific path patterns

**3. Artifacts from matrix jobs conflict**
- Add matrix values to artifact name
- Example: `name: artifacts-${{ matrix.os }}-${{ matrix.node }}`
