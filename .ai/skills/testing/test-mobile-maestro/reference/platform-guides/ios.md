# iOS Platform Guide for Maestro

## Overview

This guide covers iOS-specific considerations for running Maestro UI automation on iOS simulators.

---

## Prerequisites

### Required Software

| Component | Minimum Version | Command to Check |
|-----------|-----------------|------------------|
| macOS | 12.0+ | `sw_vers` |
| Xcode | 14.0+ | `xcodebuild -version` |
| Maestro CLI | Latest | `maestro --version` |
| idb (optional) | Latest | `idb --version` |

### Installation

```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version

# Optional: Install Facebook idb for enhanced iOS support
brew tap facebook/fb
brew install idb-companion
pip3 install fb-idb
```

---

## Simulator Setup

### Check Available Simulators

```bash
# List all simulators
xcrun simctl list devices

# List booted simulators
xcrun simctl list devices | grep Booted
```

### Boot Simulator

```bash
# Boot by name
xcrun simctl boot "iPhone 15"

# Boot by UDID
xcrun simctl boot <UDID>

# Wait for boot completion
xcrun simctl bootstatus "iPhone 15" -b
```

### Install App

```bash
# Install .app bundle on booted simulator
xcrun simctl install booted /path/to/MyApp.app

# Launch app
xcrun simctl launch booted com.myapp.bundleid

# Terminate app
xcrun simctl terminate booted com.myapp.bundleid
```

---

## Maestro Configuration

### Flow Header for iOS

```yaml
# Specify app by bundle ID
appId: com.myapp.bundleid

---
# Flow steps here
```

### Launch Options

```yaml
# Launch with fresh state
- launchApp:
    clearState: true

# Launch without clearing state
- launchApp:
    clearState: false

# Launch with specific arguments
- launchApp:
    arguments:
      - "--enable-testing"
```

---

## Selectors for iOS

### Accessibility Identifier (Recommended)

```yaml
# Best practice: use accessibility identifiers
- tapOn:
    id: "login-button"

- assertVisible:
    id: "welcome-screen"
```

### Setting Accessibility Identifiers in SwiftUI

```swift
Button("Login") {
    login()
}
.accessibilityIdentifier("login-button")
```

### Setting Accessibility Identifiers in UIKit

```swift
button.accessibilityIdentifier = "login-button"
```

### Text-based Selectors

```yaml
# Exact text match
- tapOn:
    text: "Sign In"

# Contains text
- tapOn:
    text: ".*Sign.*"  # Regex
```

---

## Apple Silicon Considerations

### Native Performance

- Maestro runs natively on Apple Silicon
- iOS simulators are arm64 (faster than Intel)
- No special configuration needed

### Troubleshooting M1/M2/M3

If Maestro fails to detect simulator:
```bash
# Ensure Xcode command line tools are set
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Reset simulator state
xcrun simctl erase all
```

---

## Troubleshooting

### Maestro Can't Find Simulator

```bash
# Check simulator is booted
xcrun simctl list devices | grep Booted

# Boot simulator manually
xcrun simctl boot "iPhone 15"

# Try specifying device
maestro test --device "iPhone 15" flow.yaml
```

### App Not Found

```bash
# Verify app is installed
xcrun simctl listapps booted | grep com.myapp

# Install app manually
xcrun simctl install booted /path/to/MyApp.app

# Check bundle ID matches flow
grep appId flow.yaml
```

### Element Not Found

```yaml
# Add timeout for slow-loading elements
- assertVisible:
    id: "element-id"
    timeout: 10000  # 10 seconds

# Use Maestro Studio to inspect elements
# Run: maestro studio
```

### Permission Dialogs

```yaml
# Handle iOS permission dialogs
- runFlow:
    when:
      visible:
        text: "Allow"
    commands:
      - tapOn:
          text: "Allow"
```

---

## CI Configuration

### GitHub Actions

```yaml
ios-maestro:
  runs-on: macos-14
  steps:
    - name: Install Maestro
      run: |
        curl -Ls "https://get.maestro.mobile.dev" | bash
        echo "$HOME/.maestro/bin" >> $GITHUB_PATH

    - name: Boot Simulator
      run: |
        xcrun simctl boot "iPhone 15"
        xcrun simctl bootstatus "iPhone 15" -b

    - name: Install App
      run: xcrun simctl install booted MyApp.app

    - name: Run Maestro Tests
      run: maestro test flows/
```

### Best Practices for CI

1. **Pre-boot simulator** before tests start
2. **Use specific device names** (not just "iPhone")
3. **Set reasonable timeouts** for CI environment
4. **Clear state** between test runs for isolation

---

## Useful Commands

```bash
# Capture screenshot
xcrun simctl io booted screenshot screenshot.png

# Record video
xcrun simctl io booted recordVideo video.mp4
# Ctrl+C to stop

# View simulator logs
xcrun simctl spawn booted log stream

# Open URL in simulator
xcrun simctl openurl booted "https://example.com"

# Send push notification
xcrun simctl push booted com.myapp.bundleid payload.json
```

---

## Known Limitations

1. **Real devices**: Maestro has limited iOS real device support
2. **System dialogs**: Some system dialogs may be difficult to automate
3. **Keyboard**: Hardware keyboard may interfere with tests
   - Use `hideKeyboard` command after input
4. **Animations**: Fast animations may cause timing issues
   - Add `assertVisible` with timeout before interactions
