# Procedure: Bootstrap Detox in a React Native repo

**Base (references):** `.ai/skills/testing/test-mobile-detox/reference/`

## Goal
Bootstrap Detox E2E testing with:
- a predictable RN E2E layout (Detox + Jest by default)
- deterministic selectors using `testID`
- a single CI-friendly command
- standardized artifacts under `artifacts/detox/`

## Inputs (collect before edits)
- Platforms in scope: iOS / Android
- Existing test runner: Jest already present? (common for RN)
- Where build outputs live (Xcode/Gradle)
- Target simulator/emulator devices
- Auth/test data strategy

## Steps
1) **Detect existing Detox setup**
   - Look for: `detox.config.mjs` (preferred), `.js`, `.cjs`, or `e2e/` tests.
   - If it exists, do not re-init; align artifacts + conventions.

2) **Install Detox and a test runner**
   - If missing:
     - `npm i -D detox`
     - Ensure Jest exists (most RN repos already have it).
   - Validate:
     - `npx detox --version`

3) **Initialize configuration (explicit paths)**
   - Preferred (if supported by your Detox version):
     - `npx detox init -r jest`
   - If the init command is not available:
     - Create a `detox.config.mjs` (ESM, preferred) that defines:
       - app binaries/build commands for iOS/Android
       - device configurations (simulator/emulator)
       - test runner = Jest
       - artifacts location = `artifacts/detox/`

4) **Create/align directory layout**
   - Recommended:
     - `e2e/`
       - `config/` (optional)
       - `tests/`
       - `helpers/`
   - Keep Detox tests isolated from unit tests.

5) **Ensure the app is testable**
   - Add stable `testID` props to key UI elements.
   - Ensure your app can run in a test environment:
     - disable animations where possible
     - add a test-only backend or deterministic seed path if needed

6) **Add a single CI-friendly command**
   - Add npm scripts (preferred):
     - `test:mobile:detox:build` → `npx detox build -c <config>`
     - `test:mobile:detox` → `npx detox test -c <config>`
   - Choose one canonical config per platform (e.g., `ios.sim.debug`, `android.emu.debug`).

7) **Add a smoke test**
   - Launch app and assert a stable “home ready” element is visible by `testID`.

## Outputs
- Detox config (`detox.config.mjs` preferred, or `.js`/`.cjs`)
- `e2e/` test layout with a smoke test
- Canonical commands for build + test
- Artifacts produced under `artifacts/detox/`

## Required verification
- `npx detox build -c <config>`
- `npx detox test -c <config>`
- Confirm artifacts exist (logs/screenshots) under `artifacts/detox/`

## Boundaries
- Do not hardcode credentials or tokens.
- Do not rely on fixed sleeps to "stabilize" tests.
- Do not use production tenants without explicit approval.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `detox build` fails | Missing Xcode/Android SDK | Install required toolchain for platform |
| Simulator not found | Wrong device name in config | Run `xcrun simctl list` and update config |
| Emulator boot timeout | Slow machine or wrong AVD | Increase timeout or use lighter emulator image |
| App crashes on launch | Build mismatch or signing issue | Clean build and rebuild |

### Common Issues

**1. iOS: "Unable to boot simulator"**
- Check Xcode is installed: `xcode-select -p`
- Reset simulator: `xcrun simctl erase all`
- Ensure device in config matches available: `xcrun simctl list devices`

**2. Android: "No emulators found"**
- Verify AVD exists: `emulator -list-avds`
- Start emulator manually first to test: `emulator @AVD_NAME`
- Check `ANDROID_HOME` and `ANDROID_SDK_ROOT` are set

**3. Metro bundler issues**
- Kill existing Metro: `lsof -ti:8081 | xargs kill`
- Clear cache: `npx react-native start --reset-cache`
