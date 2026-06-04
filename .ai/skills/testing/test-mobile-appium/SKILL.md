---
name: test-mobile-appium
description: Appium mobile automation: capabilities templates, harness bootstrap, execution, and robust environment/diagnostics for CI or device farms.
---

# Appium Mobile Automation (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Optimize for reproducibility: environment checks + deterministic selectors + strong diagnostics.

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap an Appium harness (recommended default: WebdriverIO + TS) | `reference/procedures/bootstrap.md` | `reference/examples/wdio.conf.ts` |
| Define/adjust capabilities (iOS/Android) | `reference/procedures/capabilities.md` | `reference/examples/capabilities/android.ts`, `reference/examples/capabilities/ios.ts` |
| Add a new Appium test | `reference/procedures/add-test.md` | — |
| Run locally (debug) | `reference/procedures/run-local.md` | — |
| Triage failures / improve stability | `reference/procedures/triage-failures.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Stable selectors**
   - Prefer accessibility id (`accessibilityId`) as the primary locator.
   - Avoid XPath unless unavoidable; avoid brittle class chains.

2) **No fixed sleeps**
   - Prefer explicit waits tied to conditions (element displayed/clickable).
   - Keep timeouts bounded and purposeful.

3) **Environment-first diagnostics**
   - Always verify device/emulator, SDKs, and drivers before blaming tests.
   - Capture device logs + Appium server logs for every failure.

4) **Artifact contract (for CI + triage)**
   - Standardize under: `artifacts/appium/`
   - Include: server logs, device logs, screenshots on failure (and video if feasible).

5) **No secrets in repo**
   - Inject secrets via CI secrets / env vars.
   - Never commit real credentials.

## Minimal inputs you should capture before changing code
- Platforms: iOS / Android
- Device strategy: local simulators/emulators vs device farm
- App build pipeline: where apk/ipa comes from; debug/release variants
- Automation backend: `UiAutomator2` / `XCUITest` (typical defaults)
- Test data and auth strategy

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.mjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-mobile-appium/scripts/validate-skill.mjs`

- If you changed **tests/config**:
  - `node -v`
  - `appium --version` (or `npx appium --version` if installed locally)
  - Start server:
    - `appium --log-level info` (or repo equivalent)
  - Run one test against one device config.

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not introduce multiple harnesses in the same repo; prefer one standard runner.
- Do not rely on production data or credentials.
