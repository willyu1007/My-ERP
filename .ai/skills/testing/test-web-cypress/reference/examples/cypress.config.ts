/**
 * Cypress Configuration Example
 *
 * This is a reference configuration aligned with the skill's artifact contract.
 * Adjust paths and settings to match your project structure.
 *
 * Usage: Copy to your project root as `cypress.config.ts`
 */
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    // Base URL from environment variable (keep flexible for CI mapping)
    baseUrl: process.env.BASE_URL || process.env.WEB_BASE_URL || 'http://localhost:3000',

    // Test files location
    specPattern: 'tests/web/cypress/specs/**/*.cy.{js,ts}',

    // Support file
    supportFile: 'tests/web/cypress/support/e2e.ts',

    // Fixtures folder
    fixturesFolder: 'tests/web/cypress/fixtures',

    // Downloads folder
    downloadsFolder: 'artifacts/cypress/downloads',

    // Screenshots folder (on failure)
    screenshotsFolder: 'artifacts/cypress/screenshots',

    // Videos folder
    videosFolder: 'artifacts/cypress/videos',

    // Video recording (disable in CI to save resources if not needed)
    video: true,
    videoCompression: 32,

    // Viewport
    viewportWidth: 1280,
    viewportHeight: 720,

    // Timeouts
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
    requestTimeout: 10000,

    // Retries
    retries: {
      runMode: 2, // CI
      openMode: 0, // Interactive
    },

    // Experimental features
    experimentalStudio: false,

    setupNodeEvents(on, config) {
      // Implement node event listeners here
      // Example: Custom tasks, plugins, etc.

      // JUnit reporter for CI
      // Requires: npm i -D cypress-junit-reporter
      // on('after:run', (results) => {
      //   // Custom post-run logic
      // });

      return config;
    },
  },

  // Component testing (optional)
  // component: {
  //   devServer: {
  //     framework: 'react',
  //     bundler: 'vite',
  //   },
  // },
});
