/**
 * Detox Configuration Example
 *
 * Dual-platform configuration for iOS and Android.
 * Adjust app paths, device names, and build commands for your project.
 *
 * Usage: Copy to your project root as `detox.config.mjs` or `.detoxrc.mjs`
 */
/** @type {import('detox').DetoxConfig} */
const config = {
  // Test runner configuration
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.mjs',
    },
    jest: {
      setupTimeout: 120000,
    },
  },

  // App configurations
  apps: {
    // iOS Debug
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build:
        'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },

    // iOS Release
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/MyApp.app',
      build:
        'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },

    // Android Debug
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..',
      reversePorts: [8081], // Metro bundler
    },

    // Android Release
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build:
        'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release && cd ..',
    },
  },

  // Device configurations
  devices: {
    // iOS Simulators
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15',
      },
    },

    'simulator.iphone14': {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 14',
      },
    },

    // Android Emulators
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

    // Attached Android device
    'attached.android': {
      type: 'android.attached',
      device: {
        adbName: '.*', // First available device
      },
    },
  },

  // Configuration presets (used with -c flag)
  configurations: {
    // iOS Debug (default for development)
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },

    // iOS Release (for CI)
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },

    // Android Debug (default for development)
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },

    // Android Release (for CI)
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
  },

  // Artifacts configuration
  artifacts: {
    rootDir: 'artifacts/detox',
    plugins: {
      log: {
        enabled: true,
      },
      screenshot: {
        shouldTakeAutomaticSnapshots: true,
        keepOnlyFailedTestsArtifacts: true,
        takeWhen: {
          testStart: false,
          testDone: true,
        },
      },
      video: {
        enabled: false, // Enable if needed, increases artifact size
        keepOnlyFailedTestsArtifacts: true,
      },
      instruments: {
        enabled: false,
      },
      uiHierarchy: 'enabled',
    },
  },

  // Behavior configuration
  behavior: {
    init: {
      exposeGlobals: true,
    },
    cleanup: {
      shutdownDevice: false,
    },
  },
};

export default config;
