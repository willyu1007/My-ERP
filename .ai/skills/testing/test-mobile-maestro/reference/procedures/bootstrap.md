# Procedure: Bootstrap Maestro (CLI + flow layout)

**Base (references):** `.ai/skills/testing/test-mobile-maestro/reference/`

## Goal
Bootstrap Maestro UI automation with:
- a predictable flow layout in-repo
- stable selectors (accessibility id / testID)
- a single CI-friendly command
- standardized artifacts under `artifacts/maestro/`

## Inputs (collect before edits)
- Target platforms: Android / iOS
- Device strategy: local emulator/simulator vs device farm
- App identifiers: Android package, iOS bundle id
- How the app build/install is produced (apk/ipa path or build step)

## Steps
1) **Install Maestro CLI**
   - Preferred (official installer script):
     - `curl -Ls "https://get.maestro.mobile.dev" | bash`
   - Confirm:
     - `maestro --version`

2) **Create a predictable flow layout**
   - Recommended:
     - `tests/mobile/maestro/`
       - `flows/`
       - `subflows/` (optional)
       - `data/` (optional; non-secret)
   - Keep secrets out of YAML and data files.

3) **Ensure device + app are ready**
   - Start emulator/simulator (or connect device).
   - Install the app build (apk/ipa) using your existing build pipeline.
   - Verify the app launches manually once before automating.

4) **Create a smoke flow**
   - Create `tests/mobile/maestro/flows/smoke.yaml` with:
     - `appId: <your-app-id>`
     - `launchApp`
     - a visible “home ready” assertion

5) **Align artifacts**
   - Decide where to store artifacts:
     - `artifacts/maestro/`
   - Ensure CI collects this folder even on failure.

6) **Add a single CI-friendly command**
   - Document or add a wrapper script:
     - `maestro test tests/mobile/maestro/flows/smoke.yaml`

## Outputs
- Maestro flow layout under `tests/mobile/maestro/`
- One smoke flow runnable locally
- Artifact directory contract: `artifacts/maestro/`

## Required verification
- `maestro test tests/mobile/maestro/flows/smoke.yaml`
- Confirm failure output is actionable (logs and/or screenshots captured by your setup)

## Boundaries
- Do not hardcode credentials.
- Do not rely on coordinate taps unless no stable selector exists.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| "maestro: command not found" | CLI not installed or not in PATH | Re-run installer, add to PATH |
| "No devices found" | Emulator/simulator not running | Start device first, verify with `adb devices` |
| App not found | Wrong appId or app not installed | Verify package/bundle ID, install app first |
| YAML syntax error | Indentation or format issue | Check YAML indentation (2 spaces) |

### Common Issues

**1. Installation fails on macOS**
- May need Rosetta on Apple Silicon: `softwareupdate --install-rosetta`
- Check Java is installed: `java -version`

**2. Android device not detected**
- Verify USB debugging enabled
- Check `adb devices` shows the device
- May need to accept USB debugging prompt on device

**3. iOS simulator issues**
- Ensure Xcode is installed and updated
- Check simulator is booted: `xcrun simctl list devices`
- May need to install app: `xcrun simctl install booted <app.app>`
