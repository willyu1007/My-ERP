# Procedure: Run Appium locally (debug)

**Base (references):** `.ai/skills/testing/test-mobile-appium/reference/`

## Goal
Run and debug Appium tests locally with:
- environment validation first
- reproducible run commands
- logs and artifacts for root-cause analysis

## Inputs (collect before edits)
- Platform/device target (emulator/simulator)
- App build path (apk/ipa)
- Which spec/test to run

## Steps
1) **Start device**
   - Android: start an emulator
   - iOS: start a simulator
   - Confirm the device is visible to your tooling.

2) **Ensure app build is available**
   - Build or obtain the apk/ipa locally.
   - Confirm the app installs and launches manually once.

3) **Start Appium server**
   - Prefer local install:
     - `npx appium --log-level info`
   - Keep logs:
     - redirect output to `artifacts/appium/appium-server.log` when possible.

4) **Run one test**
   - Use the harness command (preferred):
     - `npm run test:mobile:appium -- --spec <spec>`
   - Or run your runner directly (wdio/pytest/etc.).

5) **Inspect failures**
   - Confirm artifacts exist:
     - `artifacts/appium/`
   - If session creation fails:
     - check drivers installed
     - check capability correctness
     - check SDK/toolchain availability

## Outputs
- Reproduced failure locally (or confirmed infra/toolchain issue)
- Artifacts under `artifacts/appium/`

## Required verification
- After fix, re-run the same spec successfully.
- If the test is flaky, re-run at least N=3 to confirm stability.

## Boundaries
- Do not "fix" by increasing timeouts blindly; identify the condition that should be awaited.
- Do not ignore session creation errors; they usually indicate capability/toolchain issues.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Appium server won't start | Port 4723 in use | Kill existing process or use different port |
| "Session not created" | Driver or capability issue | Check server logs for specific error |
| Device disconnects mid-test | USB issue or timeout | Check cable, increase newCommandTimeout |
| Tests hang indefinitely | Appium waiting for element | Add explicit timeouts to all waits |

### Common Issues

**1. Port already in use**
- Kill existing Appium: `lsof -ti:4723 | xargs kill`
- Or use different port: `npx appium --port 4724`

**2. Emulator/simulator slow to start**
- Pre-launch device before running tests
- Use snapshot for faster boot
- Increase `appium:avdLaunchTimeout` (Android)

**3. App reinstalls every test**
- Use `appium:noReset: true` to keep app installed
- Or use `appium:fullReset: false` with explicit cleanup
