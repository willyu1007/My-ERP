# Procedure: Define/adjust Appium capabilities (iOS/Android)

**Base (references):** `.ai/skills/testing/test-mobile-appium/reference/`

## Goal
Define capabilities that are:
- explicit and version-controlled
- compatible with Appium 2 (namespaced `appium:` keys)
- portable across local and CI environments

## Inputs (collect before edits)
- Platform: iOS / Android
- Device target: emulator/simulator name, OS version
- App path or app identifier:
  - local build path to apk/ipa, or
  - preinstalled bundle/package id (device farm)
- Whether `fullReset` / `noReset` should be used (prefer clean state for determinism)

## Steps
1) **Standardize capability storage**
   - Prefer a single source:
     - `tests/mobile/appium/config/capabilities.<env>.json` (or TS module)
   - Keep secrets out of capability files.

2) **Use Appium 2 namespaced keys**
   - Use `appium:<key>` for Appium-specific capabilities.
   - Keep `platformName` at the top level.

3) **Baseline capability template**
   - Android (typical):
     - `platformName: "Android"`
     - `appium:automationName: "UiAutomator2"`
     - `appium:deviceName: "<emulator name>"`
     - `appium:app: "<path to .apk>"`
     - `appium:newCommandTimeout: <seconds>`
   - iOS (typical):
     - `platformName: "iOS"`
     - `appium:automationName: "XCUITest"`
     - `appium:deviceName: "<simulator name>"`
     - `appium:platformVersion: "<version>"`
     - `appium:app: "<path to .app/.ipa>"`
     - `appium:newCommandTimeout: <seconds>`

4) **Decide reset strategy**
   - Prefer clean launches for PR gating:
     - reset app state between tests
   - If using `noReset` for speed, ensure tests explicitly clean up their state.

5) **Add only necessary “stability” capabilities**
   - Avoid piling on random flags.
   - Every non-default capability should be documented with:
     - why it exists
     - when it can be removed

6) **Validate on one device**
   - Start Appium and run a single test to confirm session creation succeeds.

## Outputs
- Versioned capabilities/config files
- Documented device matrix and environment variables required to resolve app paths

## Required verification
- `npx appium driver list`
- Start Appium server and successfully create a session.
- Run a single smoke spec end-to-end.

## Boundaries
- Do not put credentials or tokens into capabilities.
- Do not commit absolute local paths that do not exist on CI.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| "Invalid capability" error | Wrong key name or format | Use Appium 2 namespaced keys: `appium:key` |
| Device not found | deviceName mismatch | Check exact device/emulator name |
| App not installing | Wrong app path or permissions | Verify path exists and app is signed |
| Session timeout | newCommandTimeout too low | Increase `appium:newCommandTimeout` |

### Common Issues

**1. iOS real device signing**
- Requires `appium:xcodeOrgId` and `appium:xcodeSigningId`
- Need developer provisioning profile
- May need custom WebDriverAgent bundle ID

**2. Android capabilities confusion**
- `deviceName` vs `udid`: use `udid` for specific device
- `avd` capability to auto-launch emulator
- `appPackage` + `appActivity` for pre-installed apps

**3. Cloud/device farm capabilities**
- BrowserStack: use `bstack:options` object
- Sauce Labs: use `sauce:options` object
- Check provider docs for required capabilities
