# Android Platform Guide for Maestro

## Overview

This guide covers Android-specific considerations for running Maestro UI automation on Android emulators and real devices.

---

## Prerequisites

### Required Software

| Component | Minimum Version | Command to Check |
|-----------|-----------------|------------------|
| Java JDK | 11+ | `java -version` |
| Android SDK | Platform 26+ | `adb --version` |
| Maestro CLI | Latest | `maestro --version` |

### Environment Setup

```bash
# Required environment variables
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator
```

### Installation

```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version

# Check ADB connection
adb devices
```

---

## Emulator Setup

### Create Emulator

```bash
# List available system images
sdkmanager --list | grep "system-images"

# Install system image
sdkmanager "system-images;android-34;google_apis;x86_64"

# Create AVD
avdmanager create avd \
  -n Pixel_4_API_34 \
  -k "system-images;android-34;google_apis;x86_64" \
  -d "pixel_4"
```

### Start Emulator

```bash
# With GUI
emulator @Pixel_4_API_34

# Headless (CI)
emulator @Pixel_4_API_34 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect

# Wait for device
adb wait-for-device
```

### Install App

```bash
# Install APK
adb install /path/to/app-debug.apk

# Install with options
adb install -r -g app.apk  # Replace, grant permissions

# Verify installation
adb shell pm list packages | grep myapp
```

---

## Maestro Configuration

### Flow Header for Android

```yaml
# Specify app by package name
appId: com.myapp.package

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

# Stop app (without launching)
- stopApp
```

---

## Selectors for Android

### Test Tag (Jetpack Compose - Recommended)

```yaml
# Best practice: use testTag in Compose
- tapOn:
    id: "login-button"
```

Setting in Compose:
```kotlin
Button(
    onClick = { login() },
    modifier = Modifier.testTag("login-button")
) {
    Text("Login")
}
```

### Content Description (View-based UI)

```yaml
- tapOn:
    id: "login-button"  # Maps to contentDescription
```

Setting in XML:
```xml
<Button
    android:id="@+id/loginButton"
    android:contentDescription="login-button"
    android:text="Login" />
```

### Text-based Selectors

```yaml
# Exact text
- tapOn:
    text: "Sign In"

# Contains text (regex)
- tapOn:
    text: ".*Sign.*"

# Case insensitive
- tapOn:
    text: "(?i)sign in"
```

### Resource ID

```yaml
# Use resource ID (less portable)
- tapOn:
    id: "com.myapp:id/loginButton"
```

---

## Real Device Setup

### Enable USB Debugging

1. Go to **Settings > About Phone**
2. Tap **Build Number** 7 times
3. Go to **Settings > Developer Options**
4. Enable **USB Debugging**
5. Connect device and accept prompt

### Verify Connection

```bash
# List devices
adb devices

# Should show:
# emulator-5554   device
# SERIAL_NUMBER   device
```

### Select Specific Device

```bash
# Run on specific device
maestro test --device SERIAL_NUMBER flows/smoke.yaml
```

---

## Troubleshooting

### No Devices Found

```bash
# Restart ADB
adb kill-server
adb start-server

# Check devices
adb devices

# If emulator not listed, start it
emulator @AVD_NAME
```

### App Not Found

```bash
# Verify package name
adb shell pm list packages | grep myapp

# Check appId in flow
grep appId flows/smoke.yaml

# Reinstall app
adb uninstall com.myapp.package
adb install app-debug.apk
```

### Element Not Found

```yaml
# Add timeout
- assertVisible:
    id: "element-id"
    timeout: 10000

# Use Maestro Studio to inspect
# Run: maestro studio
```

### Keyboard Issues

```yaml
# Hide keyboard after input
- inputText:
    id: "input-field"
    text: "hello"
- hideKeyboard
```

---

## CI Configuration

### GitHub Actions

```yaml
android-maestro:
  runs-on: ubuntu-latest
  steps:
    - name: Setup Java
      uses: actions/setup-java@v4
      with:
        distribution: 'temurin'
        java-version: '17'

    - name: Setup Android SDK
      uses: android-actions/setup-android@v3

    - name: Install Maestro
      run: |
        curl -Ls "https://get.maestro.mobile.dev" | bash
        echo "$HOME/.maestro/bin" >> $GITHUB_PATH

    - name: Create and Start Emulator
      run: |
        echo "y" | sdkmanager "system-images;android-34;google_apis;x86_64"
        avdmanager create avd -n test -k "system-images;android-34;google_apis;x86_64" -d "pixel_4"
        emulator @test -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &
        adb wait-for-device
        adb shell settings put global window_animation_scale 0
        adb shell settings put global transition_animation_scale 0
        adb shell settings put global animator_duration_scale 0

    - name: Install App
      run: adb install app-debug.apk

    - name: Run Maestro Tests
      run: maestro test flows/
```

### Disable Animations (Recommended for CI)

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

---

## Performance Tips

1. **Use x86_64 emulator** (faster than ARM on Intel/AMD)
2. **Disable animations** for faster and more reliable tests
3. **Use swiftshader GPU** for CI headless runs
4. **Pre-install app** before test suite
5. **Use specific device** flag when multiple devices connected

---

## Useful Commands

```bash
# Screenshot
adb exec-out screencap -p > screenshot.png

# Screen recording
adb shell screenrecord /sdcard/test.mp4
# Ctrl+C to stop
adb pull /sdcard/test.mp4

# View logs
adb logcat -d > logcat.txt

# Clear app data
adb shell pm clear com.myapp.package

# Get current activity
adb shell dumpsys window | grep -E 'mCurrentFocus'

# Input text
adb shell input text "hello"

# Tap at coordinates
adb shell input tap 500 500
```

---

## Known Limitations

1. **Permissions**: Some system permissions may require manual handling
2. **System UI**: Limited access to system settings and notifications
3. **WebViews**: May need additional configuration for web content
4. **Animations**: Can cause flakiness if not disabled

### Handling Permission Dialogs

```yaml
# Handle Android permission dialogs
- runFlow:
    when:
      visible:
        text: "Allow"
    commands:
      - tapOn:
          text: "Allow"

# Or grant via ADB before test
# adb shell pm grant com.myapp.package android.permission.CAMERA
```
