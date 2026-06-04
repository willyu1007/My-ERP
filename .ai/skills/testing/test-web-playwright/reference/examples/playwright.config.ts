/**
 * Playwright Configuration Example
 *
 * This is a reference configuration aligned with the skill's artifact contract.
 * Adjust paths and settings to match your project structure.
 *
 * Usage: Copy to your project root as `playwright.config.ts`
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Test directory
  testDir: './tests/web/playwright/specs',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright/report', open: 'never' }],
    ['junit', { outputFile: 'artifacts/playwright/junit.xml' }],
  ],

  // Shared settings for all projects
  use: {
    // Base URL from environment variable
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace on first retry (recommended for CI debugging)
    trace: 'on-first-retry',

    // Screenshot only on failure
    screenshot: 'only-on-failure',

    // Video on failure (optional, increases artifact size)
    video: 'retain-on-failure',

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Action timeout
    actionTimeout: 15000,
  },

  // Output directory for test artifacts
  outputDir: 'artifacts/playwright/test-results',

  // Global timeout
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Projects for cross-browser testing
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Local dev server (optional)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
