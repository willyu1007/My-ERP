# Android Platform Guide for Appium

## Overview

This guide covers Android-specific considerations for running Appium automation on Android emulators and real devices using the UiAutomator2 driver.

---

## Prerequisites

### Required Software

| Component | Minimum Version | Command to Check |
|-----------|-----------------|------------------|
| Java JDK | 11+ (17 recommended) | `java -version` |
| Android SDK | Platform 30+ | `sdkmanager --list` |
| Node.js | 18+ | `node -v` |
| Appium | 2.0+ | `npx appium -v` |
| UiAutomator2 Driver | 2.0+ | `npx appium driver list` |

### Environment Setup

```bash
# Add to ~/.bashrc or ~/.zshrc
export JAVA_HOME=/path/to/jdk
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

### Installation

```bash
# Install Appium
npm install -g appium
# or locally
npm install -D appium

# Install UiAutomator2 driver
npx appium driver install uiautomator2

# Verify
npx appium driver list
```

---

## Android SDK Setup

### Install Required Packages

```bash
# Install SDK packages
sdkmanager "platform-tools"
sdkmanager "platforms;android-34"
sdkmanager "build-tools;34.0.0"
sdkmanager "system-images;android-34;google_apis;x86_64"
sdkmanager "emulator"

# Accept licenses
sdkmanager --licenses
```

### Create Emulator

```bash
# Create AVD
avdmanager create avd \
  -n Pixel_4_API_34 \
  -k "system-images;android-34;google_apis;x86_64" \
  -d "pixel_4"

# List AVDs
emulator -list-avds
```

---

## Capabilities Reference

### Emulator

```typescript
const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Pixel_4_API_34',  // AVD name
  'appium:platformVersion': '14',
  'appium:app': '/path/to/app-debug.apk',
  
  // Common settings
  'appium:newCommandTimeout': 240,
  'appium:noReset': false,
  'appium:fullReset': false,
  
  // Emulator-specific
  'appium:avd': 'Pixel_4_API_34',  // Auto-launch AVD
  'appium:avdLaunchTimeout': 180000,
  'appium:avdReadyTimeout': 60000,
  
  // Performance
  'appium:autoGrantPermissions': true,
  'appium:disableWindowAnimation': true,
  'appium:skipServerInstallation': false,
};
```

### Real Device

```typescript
const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'My Device',
  'appium:udid': 'DEVICE_SERIAL',  // from `adb devices`
  'appium:app': '/path/to/app-debug.apk',
  
  // Common settings
  'appium:newCommandTimeout': 240,
  'appium:autoGrantPermissions': true,
  
  // Skip reinstalling UiAutomator2 (faster for repeated runs)
  'appium:skipServerInstallation': true,
};
```

### Pre-installed App

```typescript
const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'emulator-5554',
  
  // Use pre-installed app
  'appium:appPackage': 'com.myapp.package',
  'appium:appActivity': 'com.myapp.MainActivity',
  
  // Don't reinstall app
  'appium:noReset': true,
};
```

---

## API Level Compatibility

### Tested Configurations

| API Level | Android Version | UiAutomator2 Support | Notes |
|-----------|-----------------|---------------------|-------|
| 34 | Android 14 | Full | Recommended |
| 33 | Android 13 | Full | Stable |
| 31-32 | Android 12/12L | Full | Good |
| 30 | Android 11 | Full | Widely used |
| 29 | Android 10 | Full | Legacy |
| 26-28 | Android 8-9 | Partial | May have issues |

### Handling API Differences

```typescript
// Check API level in tests
const apiLevel = parseInt(await driver.capabilities['platformVersion'], 10);
if (apiLevel >= 33) {
  // Handle Android 13+ notification permissions
}
```

---

## Emulator Management

### Start Emulator

```bash
# With GUI
emulator @Pixel_4_API_34

# Headless (CI)
emulator @Pixel_4_API_34 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect

# Wait for boot
adb wait-for-device
adb shell getprop sys.boot_completed | grep 1
```

### GPU Options

| Option | Use Case | Performance |
|--------|----------|-------------|
| `host` | Local with GPU | Fastest |
| `swiftshader_indirect` | CI/Headless | Moderate |
| `angle_indirect` | Alternative for CI | Varies |
| `off` | Fallback | Slow |

### Disable Animations (Faster Tests)

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

---

## Troubleshooting

### Session Creation Fails

| Error | Cause | Solution |
|-------|-------|----------|
| "JAVA_HOME not set" | Missing JDK | Install JDK, set JAVA_HOME |
| "adb not found" | SDK not in PATH | Add platform-tools to PATH |
| "Device not found" | No emulator/device | Start emulator or connect device |
| "UiAutomator2 not installed" | Missing driver | `npx appium driver install uiautomator2` |

### ADB Issues

```bash
# Restart ADB
adb kill-server
adb start-server

# Check connected devices
adb devices -l

# Connect to emulator manually
adb connect localhost:5555
```

### App Installation Fails

```bash
# Clear previous installation
adb uninstall com.myapp.package

# Install with options
adb install -r -g /path/to/app.apk  # Replace, grant permissions

# Check installation
adb shell pm list packages | grep myapp
```

### UiAutomator2 Issues

```bash
# Clear UiAutomator2 server
adb uninstall io.appium.uiautomator2.server
adb uninstall io.appium.uiautomator2.server.test

# Reinstall via Appium (will happen automatically on next session)

# Check UiAutomator2 logs
adb logcat -s UiAutomator2
```

---

## CI Configuration

### GitHub Actions Example

```yaml
android-appium:
  runs-on: ubuntu-latest
  steps:
    - name: Setup Java
      uses: actions/setup-java@v4
      with:
        distribution: 'temurin'
        java-version: '17'

    - name: Setup Android SDK
      uses: android-actions/setup-android@v3

    - name: Install Appium
      run: |
        npm install -g appium
        appium driver install uiautomator2

    - name: Create and Start Emulator
      run: |
        echo "y" | sdkmanager "system-images;android-34;google_apis;x86_64"
        avdmanager create avd -n test -k "system-images;android-34;google_apis;x86_64" -d "pixel_4"
        emulator @test -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &
        adb wait-for-device
        adb shell input keyevent 82

    - name: Start Appium
      run: appium --log-level info &

    - name: Run Tests
      run: npm run test:mobile:appium
```

### Docker Example

```dockerfile
FROM openjdk:17-slim

# Install Android SDK
ENV ANDROID_HOME=/opt/android-sdk
RUN apt-get update && apt-get install -y wget unzip
RUN wget https://dl.google.com/android/repository/commandlinetools-linux-latest.zip
RUN unzip commandlinetools-linux-latest.zip -d $ANDROID_HOME/cmdline-tools

# Install Node and Appium
RUN apt-get install -y nodejs npm
RUN npm install -g appium
RUN appium driver install uiautomator2
```

---

## Device Farm Integration

### BrowserStack

```typescript
const capabilities = {
  'bstack:options': {
    userName: process.env.BROWSERSTACK_USERNAME,
    accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
    projectName: 'My Project',
    buildName: 'Build 1',
    sessionName: 'Android Test',
    device: 'Google Pixel 7',
    osVersion: '13.0',
    appiumVersion: '2.0.0',
  },
  'appium:app': 'bs://<app-hash>',
};
```

### Sauce Labs

```typescript
const capabilities = {
  'sauce:options': {
    username: process.env.SAUCE_USERNAME,
    accessKey: process.env.SAUCE_ACCESS_KEY,
    build: 'Build 1',
    name: 'Android Test',
  },
  platformName: 'Android',
  'appium:deviceName': 'Google Pixel 6 Pro GoogleAPI Emulator',
  'appium:platformVersion': '13.0',
  'appium:app': 'storage:filename=app.apk',
};
```

---

## Useful Commands

```bash
# Get device info
adb shell getprop ro.build.version.sdk  # API level
adb shell getprop ro.product.model      # Device model

# Screen recording
adb shell screenrecord /sdcard/test.mp4
adb pull /sdcard/test.mp4

# Logcat filtering
adb logcat -s MyApp:V          # Filter by tag
adb logcat | grep -i error     # Filter errors

# Get current activity
adb shell dumpsys window | grep -E 'mCurrentFocus'

# Input events
adb shell input tap 500 500    # Tap at coordinates
adb shell input text "hello"   # Type text
```
