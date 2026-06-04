# Procedure: Run Detox locally (debug)

**Base (references):** `.ai/skills/testing/test-mobile-detox/reference/`

## Goal
Run and debug Detox tests locally with:
- a quick reproduction loop
- device/simulator parity with CI (when possible)
- artifacts available for inspection

## Inputs (collect before edits)
- Which config to run (`ios.*` / `android.*`)
- Which test(s) to reproduce
- Whether failure is device-, build-, or data-specific

## Steps
1) **Verify toolchain prerequisites**
   - iOS: Xcode + simulators installed
   - Android: Android SDK + emulator installed
   - Confirm Detox is installed:
     - `npx detox --version`

2) **Build the app for the target config**
   - `npx detox build -c <config>`
   - Ensure build succeeds before running tests.

3) **Run minimal scope first**
   - Run a single test or suite subset (depending on your Jest config).
   - If Jest is used, prefer `--testNamePattern` to narrow down (flag may vary).

4) **Increase observability**
   - Run in verbose/log mode when available.
   - Ensure artifacts are being captured to `artifacts/detox/`.

5) **Classify the failure**
   - Build issue (binary not found, signing, gradle)
   - Device issue (simulator/emulator misconfigured)
   - App issue (crash, UI state mismatch)
   - Test issue (selector/timing/data assumptions)

## Outputs
- Reproduced failure locally (or confirmed CI-only/environment-only)
- A short failure classification + suggested fix direction

## Required verification
- Re-run after fix:
  - `npx detox test -c <config>`
- Confirm stability with at least one re-run.

## Boundaries
- Do not "stabilize" by adding unconditional waits.
- Do not ignore app crashes; treat them as product bugs until proven otherwise.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Build succeeds but test fails to start | App binary path wrong | Check `binaryPath` in detox.config.mjs |
| "Unable to find app bundle" (iOS) | Build output location changed | Verify derivedDataPath matches config |
| Emulator black screen | GPU issue or slow boot | Use `-gpu swiftshader` or increase boot timeout |
| Tests hang indefinitely | Synchronization issue | Check for infinite animations or network calls |

### Common Issues

**1. "Device is in use" error**
- Kill existing Detox processes
- Restart simulator/emulator
- Run `npx detox clean-framework-cache`

**2. Different results debug vs release**
- Release builds have optimizations that affect timing
- Ensure test config matches build type

**3. Metro bundler conflicts**
- Stop all Metro instances before running Detox
- Use `--reuse` flag if you want to keep Metro running
