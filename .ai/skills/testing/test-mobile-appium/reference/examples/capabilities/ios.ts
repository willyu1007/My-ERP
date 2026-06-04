/**
 * iOS Capabilities Reference
 *
 * Common capability configurations for iOS automation.
 * Use these as templates and adjust for your specific needs.
 */

// =============================================================================
// SIMULATOR - Debug Build
// =============================================================================
export const iosSimulatorDebug = {
  platformName: 'iOS',
  'appium:deviceName': 'iPhone 15',
  'appium:platformVersion': '17.0',
  'appium:automationName': 'XCUITest',
  'appium:app': './ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',

  // Simulator-specific
  'appium:isSimulator': true,
  'appium:simulatorStartupTimeout': 180000,

  // Common settings
  'appium:autoAcceptAlerts': true,
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,

  // Performance optimizations
  'appium:reduceMotion': true,
  'appium:connectHardwareKeyboard': false,
};

// =============================================================================
// SIMULATOR - Release Build
// =============================================================================
export const iosSimulatorRelease = {
  ...iosSimulatorDebug,
  'appium:app': './ios/build/Build/Products/Release-iphonesimulator/MyApp.app',
  'appium:noReset': true,
};

// =============================================================================
// REAL DEVICE (USB Connected)
// =============================================================================
export const iosRealDevice = {
  platformName: 'iOS',
  'appium:deviceName': 'iPhone', // Name from Settings > General > About
  'appium:udid': process.env.IOS_UDID || 'auto', // Specific device UDID
  'appium:platformVersion': '17.0',
  'appium:automationName': 'XCUITest',
  'appium:app': './ios/build/Build/Products/Debug-iphoneos/MyApp.app',

  // Real device requirements
  'appium:xcodeOrgId': process.env.XCODE_ORG_ID || '', // Team ID
  'appium:xcodeSigningId': 'iPhone Developer',
  'appium:updatedWDABundleId': process.env.WDA_BUNDLE_ID || '', // Custom WDA bundle ID

  // Common settings
  'appium:autoAcceptAlerts': true,
  'appium:noReset': false,
  'appium:newCommandTimeout': 240,
};

// =============================================================================
// BROWSERSTACK
// =============================================================================
export const iosBrowserStack = {
  platformName: 'iOS',
  'appium:deviceName': 'iPhone 14 Pro',
  'appium:platformVersion': '16',
  'appium:automationName': 'XCUITest',
  'appium:app': process.env.BROWSERSTACK_APP_URL || 'bs://<app-hash>',

  // BrowserStack-specific
  'bstack:options': {
    projectName: 'My Project',
    buildName: process.env.BUILD_NAME || 'Local Build',
    sessionName: 'iOS Test',
    debug: true,
    networkLogs: true,
    deviceLogs: true,
    appiumVersion: '2.0.0',
  },
};

// =============================================================================
// SAUCE LABS
// =============================================================================
export const iosSauceLabs = {
  platformName: 'iOS',
  'appium:deviceName': 'iPhone 14 Pro Simulator',
  'appium:platformVersion': '16.2',
  'appium:automationName': 'XCUITest',
  'appium:app': 'storage:filename=MyApp.app.zip',

  // Sauce Labs-specific
  'sauce:options': {
    build: process.env.BUILD_NAME || 'Local Build',
    name: 'iOS Test',
    appiumVersion: '2.0.0',
  },
};

// =============================================================================
// SAFARI BROWSER (Web Testing)
// =============================================================================
export const iosSafari = {
  platformName: 'iOS',
  'appium:deviceName': 'iPhone 15',
  'appium:platformVersion': '17.0',
  'appium:automationName': 'XCUITest',
  'appium:browserName': 'Safari',

  // Safari-specific
  'appium:autoWebview': true,
  'appium:safariInitialUrl': 'about:blank',
  'appium:safariAllowPopups': true,
};

// =============================================================================
// IPAD
// =============================================================================
export const ipadSimulator = {
  platformName: 'iOS',
  'appium:deviceName': 'iPad Pro (12.9-inch) (6th generation)',
  'appium:platformVersion': '17.0',
  'appium:automationName': 'XCUITest',
  'appium:app': './ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
  'appium:isSimulator': true,

  // iPad-specific
  'appium:forceSimulatorSoftwareKeyboardPresence': true,
};

// =============================================================================
// COMMON CAPABILITY MODIFIERS
// =============================================================================

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

  // Disable permission prompts
  autoPermissions: {
    'appium:autoAcceptAlerts': true,
    'appium:autoDismissAlerts': false,
  },

  // Enable verbose logging
  debugMode: {
    'appium:showXcodeLog': true,
    'appium:showIOSLog': true,
    'appium:printPageSourceOnFindFailure': true,
  },

  // WebView/Hybrid app settings
  hybridApp: {
    'appium:autoWebview': true,
    'appium:autoWebviewTimeout': 10000,
    'appium:webviewConnectTimeout': 30000,
  },
};

// =============================================================================
// M1/M2/M3 MAC CONSIDERATIONS
// =============================================================================
/**
 * For Apple Silicon Macs:
 *
 * 1. Use arm64 simulators when available
 * 2. Build apps with arm64 architecture
 * 3. If using Rosetta:
 *    - Set ARCHFLAGS='-arch x86_64' before building
 *    - Use x86_64 simulators
 *
 * Environment setup:
 *   export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
 *   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
 */
