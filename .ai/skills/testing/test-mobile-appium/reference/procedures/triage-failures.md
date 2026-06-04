# Procedure: Triage Appium failures / improve stability

**Base (references):** `.ai/skills/testing/test-mobile-appium/reference/`

## Goal
Turn a failing/flaky Appium run into:
- a clear classification (infra/toolchain vs product vs test)
- a minimal reproduction
- a fix that improves determinism and diagnostics

## Inputs (collect before edits)
- Failing spec/test name(s)
- Platform/device configuration and capabilities
- Artifacts: Appium server logs, device logs, screenshots

## Steps
1) **Classify failure**
   - **Session creation** failures:
     - driver missing, capability invalid, SDK issues
   - **Device/infra**:
     - emulator not ready, device offline, permissions prompts
   - **Product bug**:
     - crashes, deterministic UI regressions
   - **Test flake**:
     - timing, brittle selectors, data assumptions

2) **Minimize scope**
   - Run a single spec.
   - Disable parallelism temporarily to isolate shared device state.

3) **Inspect logs first**
   - Appium server logs usually contain the direct cause for session failures.
   - For UI failures, correlate with device logs around the timestamp.

4) **Preferred fix order**
   1. Improve selector stability (accessibility ids).
   2. Replace sleeps with explicit waits tied to conditions.
   3. Fix data determinism (seed, isolate).
   4. Stabilize environment:
      - consistent emulator images
      - stable network
      - predictable permissions handling
   5. If product bug, keep tests strict and file/fix the issue.

5) **Write a short RCA note**
   - Symptom → Root cause → Fix → Follow-ups

## Outputs
- A stable test (or a documented product bug) with evidence
- Artifacts preserved under `artifacts/appium/`

## Required verification
- Re-run the failing spec N times (recommended N=3).
- Validate on the target CI environment if CI-specific.

## Boundaries
- Do not suppress errors by catching everything.
- Do not hide regressions by weakening assertions excessively.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Session creation flaky | Device not ready or resource contention | Add device ready check, reduce parallelism |
| Element found but interaction fails | Element not interactable | Wait for clickable/enabled state |
| Works locally, fails CI | Environment differences | Match capabilities, check device images |
| Sporadic timeouts | Network or device lag | Add retries, check device performance |

### Common Issues

**1. "Element not interactable"**
- Element may be covered by another element
- Use `driver.execute('mobile: scroll', ...)` to expose
- Check element is enabled: `isEnabled()`

**2. CI-specific failures**
- CI may use different emulator images
- Network latency differs
- Use identical device configuration and capabilities

**3. Memory-related crashes**
- Appium can be memory-intensive
- Close other apps on device
- Reduce test parallelism
- Use `appium:clearSystemFiles: true` to clean up
