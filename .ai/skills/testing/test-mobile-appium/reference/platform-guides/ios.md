# iOS Platform Guide for Appium

## Overview

This guide covers iOS-specific considerations for running Appium automation on iOS simulators and real devices using the XCUITest driver.

---

## Prerequisites

### Required Software

| Component | Minimum Version | Command to Check |
|-----------|-----------------|------------------|
| Xcode | 14.0+ | `xcodebuild -version` |
| Xcode CLI Tools | Latest | `xcode-select -p` |
| Node.js | 18+ | `node -v` |
| Appium | 2.0+ | `npx appium -v` |
| XCUITest Driver | 4.0+ | `npx appium driver list` |

### Installation

```bash
# Install Appium globally or locally
npm install -g appium
# or
npm install -D appium

# Install XCUITest driver
npx appium driver install xcuitest

# Verify installation
npx appium driver list
```

---

## Xcode Setup

### Select Xcode Version

```bash
# View available Xcode installations
ls /Applications/ | grep Xcode

# Set active Xcode
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Verify
xcode-select -p
```

### Simulator Management

```bash
# List simulators
xcrun simctl list devices

# Boot simulator
xcrun simctl boot "iPhone 15"

# Install app on simulator
xcrun simctl install booted /path/to/MyApp.app

# Launch app
xcrun simctl launch booted com.myapp.bundleid
```

---

## Capabilities Reference

### Simulator (Recommended for CI)

```typescript
const capabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone 15',
  'appium:platformVersion': '17.0',
  'appium:app': '/path/to/MyApp.app',
  
  // Common settings
  'appium:newCommandTimeout': 240,
  'appium:noReset': false,
  'appium:fullReset': false,
  
  // Simulator-specific
  'appium:isSimulator': true,
  'appium:simulatorStartupTimeout': 180000,
  
  // UI settings
  'appium:autoAcceptAlerts': true,
  'appium:reduceMotion': true,
};
```

### Real Device

```typescript
const capabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'My iPhone',
  'appium:udid': 'DEVICE_UDID',  // from `xcrun xctrace list devices`
  'appium:platformVersion': '17.0',
  'appium:app': '/path/to/MyApp.ipa',
  
  // Code signing (required for real devices)
  'appium:xcodeOrgId': 'TEAM_ID',  // Apple Developer Team ID
  'appium:xcodeSigningId': 'iPhone Developer',
  'appium:updatedWDABundleId': 'com.yourorg.WebDriverAgentRunner',
  
  // Common settings
  'appium:newCommandTimeout': 240,
  'appium:autoAcceptAlerts': true,
};
```

---

## Apple Silicon (M1/M2/M3)

### Architecture Considerations

- XCUITest driver works natively on Apple Silicon
- Simulators run as `arm64` (faster than Intel)
- Some older tools may need Rosetta

### Common Issues

**WebDriverAgent build fails**
```bash
# Clean WDA
rm -rf ~/Library/Developer/Xcode/DerivedData/WebDriverAgent-*

# Rebuild via Appium
npx appium driver run xcuitest reset
```

**Simulator architecture mismatch**
```bash
# Force arm64 simulator
'appium:simulatorArch': 'arm64'
```

---

## Code Signing for Real Devices

### Requirements

1. Valid Apple Developer account
2. Development certificate
3. Provisioning profile for WebDriverAgent

### Setup WebDriverAgent

```bash
# Open WebDriverAgent project
open ~/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj

# In Xcode:
# 1. Select WebDriverAgentRunner target
# 2. Set Team (Signing & Capabilities)
# 3. Change Bundle Identifier to unique value
# 4. Build for device
```

### Capabilities for Signed WDA

```typescript
{
  'appium:xcodeOrgId': 'YOUR_TEAM_ID',
  'appium:xcodeSigningId': 'iPhone Developer',
  'appium:updatedWDABundleId': 'com.yourcompany.WebDriverAgentRunner',
  'appium:usePrebuiltWDA': true,  // Use pre-built WDA
}
```

---

## Troubleshooting

### Session Creation Fails

| Error | Cause | Solution |
|-------|-------|----------|
| "Unable to launch WebDriverAgent" | WDA not installed | Rebuild WDA or check signing |
| "Device not found" | Wrong UDID or device offline | Check `xcrun simctl list` |
| "App not installed" | Path incorrect or app not signed | Verify app path and signing |

### WebDriverAgent Issues

```bash
# Clear WDA data
xcrun simctl uninstall booted com.facebook.WebDriverAgentRunner.xctrunner

# Reset driver
npx appium driver run xcuitest reset

# Check WDA logs
tail -f ~/Library/Developer/Xcode/DerivedData/*/Logs/Test/*.log
```

### Simulator Issues

```bash
# Reset simulator
xcrun simctl erase all

# Restart CoreSimulator service
sudo killall -9 com.apple.CoreSimulator.CoreSimulatorService

# Check simulator logs
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.apple.CoreSimulator"'
```

---

## CI Configuration

### GitHub Actions Example

```yaml
ios-appium:
  runs-on: macos-14
  steps:
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install Appium
      run: |
        npm install -g appium
        appium driver install xcuitest

    - name: Start Simulator
      run: |
        xcrun simctl boot "iPhone 15"
        xcrun simctl bootstatus "iPhone 15" -b

    - name: Start Appium
      run: appium --log-level info &

    - name: Run Tests
      run: npm run test:mobile:appium
```

### Best Practices

1. Use specific simulator names (not just "iPhone")
2. Pre-boot simulator before tests
3. Use `simulatorStartupTimeout` for slow CI
4. Cache Xcode DerivedData when possible
5. Use Debug builds for faster test cycles

---

## Useful Commands

```bash
# Get device UDID (real devices)
xcrun xctrace list devices

# Pair device
xcrun devicectl device pair --device UDID

# Check provisioning profiles
security find-identity -v -p codesigning

# View app bundle info
plutil -p /path/to/MyApp.app/Info.plist
```
