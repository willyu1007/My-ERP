# Procedure: Triage Maestro failures / improve stability

**Base (references):** `.ai/skills/testing/test-mobile-maestro/reference/`

## Goal
Turn a failing/flaky Maestro run into:
- a minimal reproducible flow
- a clear classification (test issue vs product issue vs device/infra)
- a fix that improves determinism

## Inputs (collect before edits)
- Failing flow + step
- Device type (simulator/emulator/real device) and OS version
- Artifacts: logs, screenshots (and video if available)

## Steps
1) **Classify the failure**
   - **Device/infra**: emulator not booted, app not installed, permission prompts
   - **Product bug**: crash, deterministic UI regression
   - **Flow issue**: brittle selector, missing readiness wait, data assumptions

2) **Minimize scope**
   - Re-run the same flow only.
   - If the flow is long, copy to a scratch flow and keep only the failing segment to isolate.

3) **Inspect artifacts**
   - Identify the first point where UI diverged from expectations.
   - If permissions dialogs appear, add explicit handling steps (bounded and conditional).

4) **Preferred fix order**
   1. Improve selector stability (use testID/accessibility id).
   2. Add explicit readiness assertions (not sleeps).
   3. Fix data setup/determinism.
   4. Handle platform-specific prompts deterministically.
   5. If product bug, keep assertions strict and file/fix the bug.

5) **Write a short RCA note**
   - Symptom → Root cause → Fix → Follow-ups

## Outputs
- A stable flow (or a documented product bug) with evidence
- Artifacts preserved under `artifacts/maestro/`

## Required verification
- Re-run the flow multiple times (recommended N=3).
- If CI is the main target, validate on CI device targets too.

## Boundaries
- Do not add unbounded waits.
- Do not mask product regressions by relaxing checks excessively.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Flaky ~30% of runs | Animation or timing issue | Add explicit `assertVisible` with timeout |
| Screenshot shows wrong screen | Navigation not complete | Wait for target screen element before asserting |
| Works on Android, fails iOS | Platform-specific UI or IDs | Use platform-specific selectors or flows |
| Permission dialog blocks flow | System prompt not handled | Add `tapOn` for permission button if predictable |

### Common Issues

**1. System dialogs interrupt flow**
- Add handling for common dialogs (permissions, updates)
- Use `runFlow: when: visible:` for conditional handling
- Consider `clearState: true` to reduce prompts

**2. Scroll-related failures**
- Element may be off-screen
- Use `scrollUntilVisible` with direction
- Add timeout for scroll operation

**3. Different results device vs emulator**
- Performance timing differs
- Screen size affects layout
- Use same device type as CI for local testing
