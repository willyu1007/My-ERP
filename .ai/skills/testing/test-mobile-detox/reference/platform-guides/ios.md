# iOS Platform Guide for Detox

## Overview

This guide covers iOS-specific considerations for running Detox E2E tests on iOS simulators and devices.

---

## Xcode Requirements

### Version Compatibility Matrix

| Detox Version | Minimum Xcode | Recommended Xcode | iOS SDK |
|---------------|---------------|-------------------|---------|
| 20.x | 14.0 | 15.0+ | 16.0+ |
| 19.x | 13.0 | 14.3+ | 15.0+ |
| 18.x | 12.0 | 14.0+ | 14.0+ |

### Setup Commands

```bash
# Verify Xcode installation
xcode-select -p

# Set active Xcode (if multiple installed)
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Accept license
sudo xcodebuild -license accept

# Install command line tools
xcode-select --install
```

---

## Simulator Management

### List Available Simulators

```bash
# List all devices
xcrun simctl list devices

# List only available (booted-capable) devices
xcrun simctl list devices available

# List with JSON output (for scripting)
xcrun simctl list devices --json
```

### Common Simulator Commands

```bash
# Boot simulator
xcrun simctl boot "iPhone 15"

# Shutdown simulator
xcrun simctl shutdown "iPhone 15"

# Erase (reset) simulator
xcrun simctl erase "iPhone 15"

# Erase all simulators
xcrun simctl erase all

# Install app
xcrun simctl install booted /path/to/MyApp.app

# Launch app
xcrun simctl launch booted com.myapp.bundle

# Get simulator UDID
xcrun simctl list devices | grep "iPhone 15"
```

---

## Apple Silicon (M1/M2/M3) Considerations

### Architecture Compatibility

- M1/M2/M3 Macs use `arm64` architecture
- iOS simulators on Apple Silicon run natively (faster than Intel)
- Some older dependencies may need Rosetta

### Rosetta Setup (if needed)

```bash
# Install Rosetta
softwareupdate --install-rosetta --agree-to-license

# Run terminal in Rosetta (for specific commands)
arch -x86_64 /bin/bash
```

### Common Issues on Apple Silicon

**1. Pod install fails with architecture errors**
```bash
# Clean and reinstall with arch flag
cd ios
arch -x86_64 pod install
```

**2. Build fails with "building for iOS Simulator, but linking in object file built for iOS"**
- Ensure all pods support arm64 simulator
- Add to Podfile:
```ruby
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64' # if using Rosetta
    end
  end
end
```

---

## Build Configuration

### Debug vs Release

| Build Type | Use Case | Performance | Debugging |
|------------|----------|-------------|-----------|
| Debug | Development, local testing | Slower | Full |
| Release | CI, performance testing | Faster | Limited |

### Build Commands

```bash
# Debug build
xcodebuild -workspace ios/MyApp.xcworkspace \
  -scheme MyApp \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ios/build

# Release build
xcodebuild -workspace ios/MyApp.xcworkspace \
  -scheme MyApp \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath ios/build
```

### Clean Build

```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clean project
xcodebuild clean -workspace ios/MyApp.xcworkspace -scheme MyApp

# Clean Detox build cache
detox clean-framework-cache
```

---

## Code Signing

### Development (Simulator)

- Simulators do NOT require code signing
- Use `CODE_SIGN_IDENTITY=""` and `CODE_SIGNING_REQUIRED=NO`

### CI Environment

For CI, add to build command:
```bash
xcodebuild ... \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO
```

### Real Devices (if needed)

Real device testing requires:
- Apple Developer account
- Valid provisioning profile
- Development certificate

---

## Detox Configuration for iOS

### Example Config Section

```javascript
// detox.config.mjs
export default {
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15', // Match `xcrun simctl list`
      },
    },
    'simulator.ipad': {
      type: 'ios.simulator',
      device: {
        type: 'iPad Pro (12.9-inch) (6th generation)',
      },
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
  },
};
```

---

## Troubleshooting iOS Issues

### Simulator Won't Boot

```bash
# Check simulator status
xcrun simctl list devices

# Force shutdown all
xcrun simctl shutdown all

# Reset simulator
xcrun simctl erase "iPhone 15"

# If still failing, restart Simulator.app
killall "Simulator"
```

### App Not Installing

```bash
# Verify .app exists at path
ls -la ios/build/Build/Products/Debug-iphonesimulator/

# Manual install for debugging
xcrun simctl install booted /path/to/MyApp.app

# Check for signing issues
codesign -dv --verbose=4 /path/to/MyApp.app
```

### Metro Bundler Issues

```bash
# Kill Metro
lsof -ti:8081 | xargs kill -9

# Clear Metro cache
npx react-native start --reset-cache

# Clear watchman
watchman watch-del-all
```

### Build Failures

```bash
# Clean everything
cd ios
rm -rf Pods Podfile.lock
rm -rf ~/Library/Developer/Xcode/DerivedData
pod cache clean --all
pod install

# If CocoaPods issues
gem install cocoapods
pod repo update
```

---

## CI-Specific Notes

### GitHub Actions

```yaml
jobs:
  ios-test:
    runs-on: macos-14  # Use latest macOS for latest Xcode
    steps:
      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_15.0.app

      - name: Boot Simulator
        run: |
          xcrun simctl boot "iPhone 15" || true
          xcrun simctl bootstatus "iPhone 15" -b
```

### Performance Tips

1. Use `macos-14` or later runners for better performance
2. Pre-boot simulator before tests
3. Use Debug builds for faster iteration
4. Cache CocoaPods: `~/.cocoapods` and `ios/Pods`
