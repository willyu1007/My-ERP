/**
 * Android Capabilities Reference
 *
 * Common capability configurations for Android automation.
 * Use these as templates and adjust for your specific needs.
 */

// =============================================================================
// EMULATOR - Debug Build
// =============================================================================
export const androidEmulatorDebug = {
  platformName: 'Android',
  'appium:deviceName': 'Pixel_4_API_33',
  'appium:platformVersion': '13',
  'appium:automationName': 'UiAutomator2',
  'appium:app': './android/app/build/outputs/apk/debug/app-debug.apk',

  // Emulator-specific
  'appium:avd': 'Pixel_4_API_33',
  'appium:avdLaunchTimeout': 180000,
  'appium:avdReadyTimeout': 60000,

  // Common settings
  'appium:autoGrantPermissions': true,
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,

  // Performance optimizations
  'appium:disableWindowAnimation': true,
  'appium:skipServerInstallation': false,
  'appium:skipDeviceInitialization': false,
};

// =============================================================================
// EMULATOR - Release Build
// =============================================================================
export const androidEmulatorRelease = {
  ...androidEmulatorDebug,
  'appium:app': './android/app/build/outputs/apk/release/app-release.apk',
  'appium:noReset': true, // Keep app data between tests
};

// =============================================================================
// REAL DEVICE (USB Connected)
// =============================================================================
export const androidRealDevice = {
  platformName: 'Android',
  'appium:deviceName': 'Android Device', // Any connected device
  'appium:udid': process.env.ANDROID_UDID || '', // Specific device UDID
  'appium:automationName': 'UiAutomator2',
  'appium:app': './android/app/build/outputs/apk/debug/app-debug.apk',

  // Real device settings
  'appium:autoGrantPermissions': true,
  'appium:noReset': false,
  'appium:newCommandTimeout': 240,

  // Skip AVD settings for real devices
  'appium:skipServerInstallation': true,
};

// =============================================================================
// BROWSERSTACK
// =============================================================================
export const androidBrowserStack = {
  platformName: 'Android',
  'appium:deviceName': 'Google Pixel 7',
  'appium:platformVersion': '13.0',
  'appium:automationName': 'UiAutomator2',
  'appium:app': process.env.BROWSERSTACK_APP_URL || 'bs://<app-hash>',

  // BrowserStack-specific
  'bstack:options': {
    projectName: 'My Project',
    buildName: process.env.BUILD_NAME || 'Local Build',
    sessionName: 'Android Test',
    debug: true,
    networkLogs: true,
    deviceLogs: true,
    appiumVersion: '2.0.0',
  },
};

// =============================================================================
// SAUCE LABS
// =============================================================================
export const androidSauceLabs = {
  platformName: 'Android',
  'appium:deviceName': 'Google Pixel 6 Pro GoogleAPI Emulator',
  'appium:platformVersion': '13.0',
  'appium:automationName': 'UiAutomator2',
  'appium:app': 'storage:filename=app-debug.apk',

  // Sauce Labs-specific
  'sauce:options': {
    build: process.env.BUILD_NAME || 'Local Build',
    name: 'Android Test',
    appiumVersion: '2.0.0',
  },
};

// =============================================================================
// CHROME BROWSER (Hybrid/Web Testing)
// =============================================================================
export const androidChrome = {
  platformName: 'Android',
  'appium:deviceName': 'Pixel_4_API_33',
  'appium:platformVersion': '13',
  'appium:automationName': 'UiAutomator2',
  'appium:browserName': 'Chrome',

  // Chrome-specific
  'appium:chromedriverAutodownload': true,
  'appium:autoWebview': true,
  'appium:autoWebviewTimeout': 10000,
};

// =============================================================================
// COMMON CAPABILITY MODIFIERS
// =============================================================================

/**
 * Add these to any capability set for specific behaviors
 */
export const capabilityModifiers = {
  // Keep app state between tests
  persistentSession: {
    'appium:noReset': true,
    'appium:fullReset': false,
  },

  // Fresh install every time
  cleanSession: {
    'appium:noReset': false,
    'appium:fullReset': true,
  },

  // Skip animations for faster tests
  fastMode: {
    'appium:disableWindowAnimation': true,
    'appium:skipUnlock': true,
  },

  // Enable verbose logging
  debugMode: {
    'appium:printPageSourceOnFindFailure': true,
    'appium:enablePerformanceLogging': true,
  },
};
