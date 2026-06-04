# Procedure: Bootstrap an Appium harness (recommended: WebdriverIO + TypeScript)

**Base (references):** `.ai/skills/testing/test-mobile-appium/reference/`

## Goal
Bootstrap Appium automation with:
- a single, standard test harness (recommended: WebdriverIO + TypeScript)
- Appium 2 + explicit drivers (UiAutomator2 / XCUITest)
- predictable layout and a CI-friendly command
- standardized artifacts under `artifacts/appium/`

## Inputs (collect before edits)
- Platforms: Android / iOS
- Where app builds come from (apk/ipa path, debug/release)
- Device targets (emulator/simulator names)
- Whether the repo already uses Mocha/Jest/other runners
- Whether a device farm is used (BrowserStack/Sauce/etc.)

## Steps
1) **Detect existing harness**
   - Look for:
     - `wdio.conf.*`, `webdriverio` deps
     - `pytest.ini` + Appium client
     - `Appium`-specific runner configs
   - If an Appium harness already exists, do not introduce a second one. Align it to the artifact contract.

2) **Choose the default harness (if none exists)**
   - Recommended default:
     - WebdriverIO + TypeScript + Mocha
   - Rationale: strong ecosystem + CI-friendly.

3) **Install dependencies (default harness)**
   - Add dev deps (exact set may vary by repo):
     - `appium`
     - `webdriverio` and WebdriverIO CLI/runner
     - a test framework (Mocha or Jest) and reporter(s)
   - Prefer local installs and `npx` execution for reproducibility.

4) **Install required Appium drivers**
   - Android (typical):
     - `npx appium driver install uiautomator2`
   - iOS (typical):
     - `npx appium driver install xcuitest`
   - Verify installed drivers:
     - `npx appium driver list`

5) **Create/align directory layout**
   - Recommended:
     - `tests/mobile/appium/`
       - `specs/`
       - `pages/` (optional)
       - `utils/`
       - `config/` (capabilities, env mapping)
   - Keep appium tests isolated from Detox/Maestro.

6) **Create a canonical run command**
   - Add an npm script (preferred):
     - `test:mobile:appium` → runs the suite via your chosen runner
   - Ensure it can run in CI (headless, deterministic).

7) **Align artifacts**
   - Ensure the harness captures, at minimum:
     - Appium server logs
     - device logs (logcat / syslog)
     - screenshots on failure
   - Copy all outputs into:
     - `artifacts/appium/`

8) **Add a smoke test**
   - Launch app and assert a stable “home ready” element by accessibility id/testID.

## Outputs
- A single Appium harness (or aligned existing one)
- Tests under `tests/mobile/appium/`
- Canonical run command for CI
- Artifacts under `artifacts/appium/`

## Required verification
- Verify Appium + drivers:
  - `npx appium --version`
  - `npx appium driver list`
- Run a smoke test against one device config end-to-end.

## Boundaries
- Do not install both global and local Appium without documenting the precedence.
- Do not hardcode device-specific absolute paths that break on CI.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| "appium: command not found" | Not installed globally | Use `npx appium` or install globally |
| Driver not found | Driver not installed | Run `npx appium driver install uiautomator2` |
| Session creation fails | Capabilities mismatch | Check platformName, deviceName, app path |
| "JAVA_HOME not set" | Android SDK setup incomplete | Set JAVA_HOME and ANDROID_HOME env vars |

### Common Issues

**1. Appium 1.x vs 2.x confusion**
- Appium 2 requires namespaced capabilities: `appium:deviceName`
- Install drivers separately: `npx appium driver install xcuitest`
- Check version: `npx appium --version`

**2. iOS: "Could not create simulator"**
- Verify Xcode command line tools: `xcode-select -p`
- Check simulator exists: `xcrun simctl list devices`
- Try specific device: `appium:udid: "SIMULATOR_UDID"`

**3. Android: "adb not found"**
- Set `ANDROID_HOME` or `ANDROID_SDK_ROOT`
- Add platform-tools to PATH
- Verify: `adb devices`
