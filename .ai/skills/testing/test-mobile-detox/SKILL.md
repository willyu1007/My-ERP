---
name: test-mobile-detox
description: Detox mobile E2E automation for React Native: bootstrap, author flows, run/debug, and produce reliable artifacts for CI.
---

# Detox Mobile E2E Automation (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Optimize for determinism and reproducible artifacts.

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap Detox in a React Native repo | `reference/procedures/bootstrap.md` | `reference/examples/detox.config.mjs` |
| Add a new Detox E2E test | `reference/procedures/add-test.md` | `reference/examples/smoke.e2e.ts` |
| Run locally (debug) | `reference/procedures/run-local.md` | — |
| Triage failures / reduce flaky | `reference/procedures/triage-failures.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Stable selectors**
   - Prefer RN `testID` and accessibility identifiers as the primary locator strategy.
   - Avoid text-only selectors when localization or dynamic content exists.

2) **No fixed sleeps**
   - Do not rely on arbitrary delays.
   - Use Detox synchronization and explicit waits/assertions.

3) **Test isolation**
   - Each test must be runnable independently.
   - Reset app state between tests (relaunch) unless explicitly optimized.

4) **Artifact contract (for CI + triage)**
   - Standardize under: `artifacts/detox/`
   - Must include: logs + screenshots on failure (and video if your setup supports it).

5) **No secrets in repo**
   - Test credentials must come from CI secrets / local env vars.
   - Never commit real user credentials.

## Minimal inputs you should capture before changing code
- Platforms: iOS / Android (one or both)
- Device targets: simulator/emulator names + OS versions
- Build variants: debug vs release
- Auth model and whether a test-only bypass exists
- Test data strategy (seeded test tenant vs local mock)

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.mjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-mobile-detox/scripts/validate-skill.mjs`

- If you changed **tests/config**:
  - `npx detox --version`
  - Build + test (configuration name varies by repo):
    - `npx detox build -c <config>`
    - `npx detox test -c <config>`

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not introduce a second RN E2E framework unless Detox is insufficient for a documented reason.
- Do not rely on production services without explicit approval and isolation.
