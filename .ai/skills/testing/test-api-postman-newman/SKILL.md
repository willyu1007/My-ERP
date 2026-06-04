---
name: test-api-postman-newman
description: Postman + Newman API automation: collection conventions, deterministic assertions, local/CI execution, and actionable failure summaries.
---

# Postman + Newman API Automation (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Optimize for determinism and actionable failures.

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap API automation (collections + Newman) | `reference/procedures/bootstrap.md` | `reference/examples/smoke.collection.json`, `reference/examples/dev.env.json` |
| Add/extend a request + tests | `reference/procedures/add-request-and-tests.md` | `reference/examples/smoke.collection.json` |
| Run locally / in CI | `reference/procedures/run.md` | — |
| Triage failures / improve signal | `reference/procedures/triage-failures.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Collection conventions**
   - Keep collections versioned in-repo (exported JSON).
   - Use folders to reflect product areas and suites (smoke/regression).

2) **Deterministic assertions**
   - Assert on stable contracts: status code, schema, key fields.
   - Avoid asserting on volatile fields (timestamps, random IDs) unless normalized.

3) **Environment separation**
   - Use environment files for non-secret config.
   - Inject secrets via CI secrets / env vars at runtime.

4) **Artifact contract (for CI + triage)**
   - Standardize under: `artifacts/newman/`
   - Include at least:
     - JUnit XML (machine-readable)
     - JSON/HTML summary (human-readable) when feasible

5) **No secrets in repo**
   - Never commit tokens, passwords, or private keys in collection/env JSON.

## Minimal inputs you should capture before changing code
- API base URL(s) per environment
- Auth model (API key / OAuth / session cookie) and test credentials strategy
- Test data strategy (seeded fixtures, dedicated test tenant)
- Which endpoints are in scope (smoke vs regression)

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.mjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-api-postman-newman/scripts/validate-skill.mjs`

- If you changed **collections/tests**:
  - `npx newman --version`
  - Run the target collection:
    - `npx newman run <collection.json> -e <env.json>`

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not introduce a second API test DSL unless Postman/Newman is insufficient for the specific need.
- Do not run destructive mutations against shared environments without explicit gating.
