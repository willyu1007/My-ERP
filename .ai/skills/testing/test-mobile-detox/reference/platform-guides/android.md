# Android Platform Guide for Detox

## Overview

This guide covers Android-specific considerations for running Detox E2E tests on Android emulators and devices.

---

## SDK Requirements

### Version Compatibility Matrix

| Detox Version | Minimum SDK | Target SDK | Recommended API Level |
|---------------|-------------|------------|----------------------|
| 20.x | 21 | 33+ | 33 (Android 13) |
| 19.x | 21 | 31+ | 31 (Android 12) |
| 18.x | 18 | 30+ | 30 (Android 11) |

### Environment Setup

```bash
# Required environment variables
export ANDROID_HOME=$HOME/Android/Sdk  # or /Users/$USER/Library/Android/sdk on macOS
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin

# Verify setup
adb --version
emulator -version
```

---

## Emulator Management

### List Available Emulators

```bash
# List AVDs (Android Virtual Devices)
emulator -list-avds

# List running emulators
adb devices
```

### Create Emulator

```bash
# Using avdmanager (command line)
avdmanager create avd \
  -n Pixel_4_API_33 \
  -k "system-images;android-33;google_apis;x86_64" \
  -d "pixel_4"

# Download system image first if needed
sdkmanager "system-images;android-33;google_apis;x86_64"
```

### Start Emulator

```bash
# Start with GUI
emulator @Pixel_4_API_33

# Start headless (for CI)
emulator @Pixel_4_API_33 -no-window -no-audio -no-boot-anim

# Start with specific GPU mode
emulator @Pixel_4_API_33 -gpu swiftshader_indirect  # For CI
emulator @Pixel_4_API_33 -gpu host  # For local with GPU

# Wait for boot completion
adb wait-for-device
adb shell getprop sys.boot_completed | grep -m 1 '1'
```

### Common ADB Commands

```bash
# List connected devices
adb devices

# Install APK
adb install app/build/outputs/apk/debug/app-debug.apk

# Uninstall app
adb uninstall com.myapp.package

# Clear app data
adb shell pm clear com.myapp.package

# Get device logs
adb logcat

# Capture screenshot
adb exec-out screencap -p > screenshot.png
```

---

## Build Configuration

### Gradle Commands

```bash
# Debug build
cd android
./gradlew assembleDebug

# Debug build with test APK (required for Detox)
./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug

# Release build
./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release

# Clean build
./gradlew clean
```

### Build Variants

| Variant | Use Case | Debugging | Performance |
|---------|----------|-----------|-------------|
| debug | Development | Full | Slower |
| release | CI/Production | Limited | Faster |

### Gradle Properties for CI

```properties
# gradle.properties
org.gradle.daemon=false
org.gradle.parallel=true
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
android.useAndroidX=true
```

---

## Detox Configuration for Android

### Example Config Section

```javascript
// detox.config.mjs
export default {
  devices: {
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_4_API_33',
      },
    },
    'emulator.pixel5': {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_5_API_34',
      },
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*',  // Regex for first available
      },
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],  // Metro bundler
    },
  },
  configurations: {
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
```

---

## API Level Compatibility

### Tested API Levels

| API Level | Android Version | Status | Notes |
|-----------|-----------------|--------|-------|
| 34 | Android 14 | Recommended | Latest stable |
| 33 | Android 13 | Supported | Good compatibility |
| 31-32 | Android 12/12L | Supported | Minor quirks |
| 29-30 | Android 10-11 | Supported | Legacy |
| 21-28 | Android 5-9 | Limited | May have issues |

### Handling API Differences

```javascript
// In tests, check API level if needed
const apiLevel = parseInt(await device.getPlatformVersion(), 10);
if (apiLevel >= 33) {
  // Android 13+ specific handling
}
```

---

## Troubleshooting Android Issues

### Emulator Won't Start

```bash
# Check if KVM is available (Linux)
egrep -c '(vmx|svm)' /proc/cpuinfo  # Should be > 0

# Check emulator logs
emulator @AVD_NAME -verbose

# Cold boot (reset emulator state)
emulator @AVD_NAME -no-snapshot-load

# Delete and recreate AVD
avdmanager delete avd -n AVD_NAME
```

### ADB Device Not Found

```bash
# Restart ADB server
adb kill-server
adb start-server

# Check USB debugging (real devices)
adb devices  # Should show device

# For emulator, ensure it's fully booted
adb wait-for-device
```

### App Installation Fails

```bash
# Uninstall first
adb uninstall com.myapp.package

# Install with replace flag
adb install -r app-debug.apk

# Grant all permissions
adb install -g app-debug.apk

# Check for signature conflicts
adb shell pm list packages | grep myapp
```

### Metro Connection Issues

```bash
# Reverse port for Metro bundler
adb reverse tcp:8081 tcp:8081

# Check Metro is running
curl http://localhost:8081/status

# Clear cache and restart
npx react-native start --reset-cache
```

### Gradle Build Failures

```bash
# Clean everything
cd android
./gradlew clean
rm -rf ~/.gradle/caches/
rm -rf .gradle/

# Rebuild
./gradlew assembleDebug --stacktrace
```

---

## CI-Specific Notes

### GitHub Actions

```yaml
jobs:
  android-test:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Create AVD
        run: |
          echo "y" | sdkmanager "system-images;android-33;google_apis;x86_64"
          avdmanager create avd -n test -k "system-images;android-33;google_apis;x86_64" -d "pixel_4"

      - name: Start Emulator
        run: |
          emulator @test -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &
          adb wait-for-device
          adb shell input keyevent 82  # Unlock screen
```

### GitLab CI

```yaml
android-test:
  image: reactnativecommunity/react-native-android:latest
  script:
    - emulator @test -no-window -gpu swiftshader_indirect &
    - adb wait-for-device
    - ./gradlew assembleDebug assembleAndroidTest
    - detox test -c android.emu.debug
```

### Performance Tips

1. Use hardware acceleration (KVM on Linux, HAXM on Windows)
2. Use `x86_64` system images (faster than ARM)
3. Cache Gradle dependencies: `~/.gradle/caches/`
4. Use `swiftshader_indirect` GPU for CI headless runs
5. Disable animations for faster tests:

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

---

## Device Farm Considerations

### AWS Device Farm

- Requires specific APK configurations
- Use `android.attached` device type
- App must be signed

### Firebase Test Lab

```bash
# Run tests on Firebase
gcloud firebase test android run \
  --type instrumentation \
  --app app-debug.apk \
  --test app-debug-androidTest.apk \
  --device model=Pixel4,version=30
```

### BrowserStack

- Upload APK via API
- Use BrowserStack-specific capabilities
- Requires paid plan for automation
