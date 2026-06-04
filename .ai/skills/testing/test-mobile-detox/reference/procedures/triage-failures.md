# Procedure: Triage Detox failures / reduce flakiness

**Base (references):** `.ai/skills/testing/test-mobile-detox/reference/`

## Goal
Turn a failing/flaky Detox run into:
- a clear classification (test bug vs product bug vs infra/build)
- a minimal reproducible case
- improved determinism (selectors, data, sync)

## Inputs (collect before edits)
- Failing test name(s)
- Platform/config (iOS/Android, debug/release)
- Artifacts: logs, screenshots, (video if available), device logs

## Steps
1) **Classify the failure**
   - **Build/infra**: signing, gradle, simulator boot issues
   - **Product bug**: crash or deterministic UI regression
   - **Test flake**: timing/synchronization or data dependence

2) **Minimize scope**
   - Run the single failing test repeatedly.
   - Disable parallelism if your runner uses it.

3) **Inspect artifacts**
   - Check:
     - app logs around the failure
     - last visible UI state in screenshots
     - whether the app crashed (stack trace)

4) **Preferred fix order**
   1. Add/strengthen `testID` on key elements.
   2. Replace brittle interactions with deterministic steps.
   3. Ensure app is idle/synchronized; add explicit waits only with bounded conditions.
   4. Fix test data determinism (seed, isolate, clean up).
   5. If the product is the root cause, file/fix product issue and keep test strict.

5) **Write a short RCA note**
   - Symptom → Root cause → Fix → Follow-ups (e.g., add test-only seed API)

## Outputs
- Deterministic test (or documented product bug with evidence)
- Artifacts remain under `artifacts/detox/`

## Required verification
- Re-run the failing test N times (recommended N=3).
- Confirm no new flakiness introduced across configs/platforms in scope.

## Boundaries
- Do not mask real regressions by weakening assertions.
- Do not disable tests without replacement and explicit owner.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Flaky ~20% of runs | Animation or async timing | Disable animations, add explicit waits |
| Crash in native code | App bug or memory issue | Check crash logs, file product bug |
| Works on iOS, fails Android | Platform-specific behavior | Check testID accessibility, platform code |
| Screenshot shows wrong screen | Navigation timing | Wait for specific element before asserting |

### Common Issues

**1. Synchronization failures**
- Detox waits for app to be idle; infinite animations break this
- Add `detox.disableSynchronization()` temporarily to diagnose
- Fix: disable animations in test builds

**2. Order-dependent test failures**
- Run single test: passes. Full suite: fails
- State leaking between tests
- Fix: use `beforeEach` to reset app state

**3. Native crash without JS stack**
- Check native logs: `adb logcat` or Xcode console
- May be memory issue or native module bug
- Reduce test parallelism if memory-related
