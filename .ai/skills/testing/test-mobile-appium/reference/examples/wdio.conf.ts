/**
 * WebdriverIO Configuration for Appium
 *
 * A reference configuration for mobile automation with Appium 2.x.
 * Supports both iOS and Android with environment-based switching.
 *
 * Usage: Copy to your project as `wdio.conf.ts`
 * Run: npx wdio run wdio.conf.ts
 */
import type { Options } from '@wdio/types';
import path from 'path';

// Determine platform from environment or default to android
const PLATFORM = (process.env.PLATFORM || 'android').toLowerCase();
const isIOS = PLATFORM === 'ios';

// App paths (adjust for your project)
const APP_PATH = isIOS
  ? process.env.IOS_APP_PATH || path.resolve('./ios/build/MyApp.app')
  : process.env.ANDROID_APP_PATH || path.resolve('./android/app/build/outputs/apk/debug/app-debug.apk');

// Device configuration
const DEVICE_NAME = isIOS
  ? process.env.IOS_DEVICE || 'iPhone 15'
  : process.env.ANDROID_DEVICE || 'Pixel_4_API_33';

const PLATFORM_VERSION = isIOS
  ? process.env.IOS_VERSION || '17.0'
  : process.env.ANDROID_VERSION || '13';

export const config: Options.Testrunner = {
  // Runner
  runner: 'local',

  // Test files
  specs: ['./tests/mobile/appium/specs/**/*.ts'],
  exclude: [],

  // Capabilities
  capabilities: [
    {
      platformName: isIOS ? 'iOS' : 'Android',
      'appium:deviceName': DEVICE_NAME,
      'appium:platformVersion': PLATFORM_VERSION,
      'appium:app': APP_PATH,
      'appium:automationName': isIOS ? 'XCUITest' : 'UiAutomator2',

      // Common capabilities
      'appium:newCommandTimeout': 240,
      'appium:noReset': false,
      'appium:fullReset': false,

      // iOS-specific
      ...(isIOS && {
        'appium:autoAcceptAlerts': true,
        'appium:showXcodeLog': true,
      }),

      // Android-specific
      ...(!isIOS && {
        'appium:appWaitActivity': '*',
        'appium:autoGrantPermissions': true,
        'appium:disableWindowAnimation': true,
      }),
    },
  ],

  // Log level
  logLevel: 'info',

  // Bail after N failures
  bail: 0,

  // Base URL (for web context if needed)
  baseUrl: '',

  // Timeouts
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // Appium service
  services: [
    [
      'appium',
      {
        args: {
          relaxedSecurity: true,
          log: './artifacts/appium/appium.log',
        },
        logPath: './artifacts/appium/',
      },
    ],
  ],

  // Framework
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  // Reporters
  reporters: [
    'spec',
    [
      'junit',
      {
        outputDir: './artifacts/appium',
        outputFileFormat: (options) => `results-${options.cid}.xml`,
      },
    ],
  ],

  // Hooks
  beforeSession: async function (config, capabilities, specs) {
    console.log(`Starting session for ${PLATFORM}`);
    console.log(`App: ${APP_PATH}`);
    console.log(`Device: ${DEVICE_NAME} (${PLATFORM_VERSION})`);
  },

  afterTest: async function (test, context, { error, result, duration, passed, retries }) {
    if (!passed) {
      // Take screenshot on failure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `./artifacts/appium/screenshots/${test.title}-${timestamp}.png`;
      await browser.saveScreenshot(screenshotPath);
    }
  },

  afterSession: async function (config, capabilities, specs) {
    console.log('Session ended');
  },
};
