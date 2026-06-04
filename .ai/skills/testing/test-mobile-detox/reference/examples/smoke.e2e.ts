/**
 * Detox Smoke Test Example
 *
 * A minimal smoke test to verify app launches and core elements are accessible.
 * Use as a template for new E2E tests.
 *
 * Best practices demonstrated:
 * - Stable selectors (testID)
 * - No fixed sleeps (use waitFor + assertions)
 * - Test isolation (relaunch between tests)
 */
import { device, element, by, expect, waitFor } from 'detox';

describe('Smoke Tests', () => {
  beforeAll(async () => {
    // Launch app fresh before test suite
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' },
    });
  });

  beforeEach(async () => {
    // Reload React Native (faster than full relaunch)
    await device.reloadReactNative();
  });

  afterAll(async () => {
    // Cleanup after suite
    await device.terminateApp();
  });

  it('should launch successfully', async () => {
    // Assert main screen is visible
    await expect(element(by.id('main-screen'))).toBeVisible();
  });

  it('should display welcome message', async () => {
    // Wait for element with timeout
    await waitFor(element(by.id('welcome-text')))
      .toBeVisible()
      .withTimeout(5000);

    // Assert text content
    await expect(element(by.id('welcome-text'))).toHaveText('Welcome');
  });

  it('should navigate to settings', async () => {
    // Tap navigation element
    await element(by.id('settings-tab')).tap();

    // Wait for settings screen
    await waitFor(element(by.id('settings-screen')))
      .toBeVisible()
      .withTimeout(3000);
  });
});

describe('Login Flow', () => {
  beforeEach(async () => {
    await device.reloadReactNative();

    // Navigate to login if needed
    const loginButton = element(by.id('login-button'));
    try {
      await expect(loginButton).toBeVisible();
      await loginButton.tap();
    } catch {
      // Already on login screen
    }
  });

  it('should show login form', async () => {
    await expect(element(by.id('email-input'))).toBeVisible();
    await expect(element(by.id('password-input'))).toBeVisible();
    await expect(element(by.id('submit-button'))).toBeVisible();
  });

  it('should validate empty form', async () => {
    // Submit empty form
    await element(by.id('submit-button')).tap();

    // Expect validation error
    await waitFor(element(by.id('error-message')))
      .toBeVisible()
      .withTimeout(2000);
  });

  it('should login with valid credentials', async () => {
    // Get credentials from environment
    const testUser = process.env.TEST_USER || 'test@example.com';
    const testPass = process.env.TEST_PASS || 'password123';

    // Fill form
    await element(by.id('email-input')).typeText(testUser);
    await element(by.id('password-input')).typeText(testPass);

    // Hide keyboard
    await element(by.id('password-input')).tapReturnKey();

    // Submit
    await element(by.id('submit-button')).tap();

    // Wait for home screen (indicates successful login)
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });
});

describe('Scroll & List', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    await element(by.id('list-tab')).tap();
  });

  it('should scroll to bottom of list', async () => {
    // Scroll until element is visible
    await waitFor(element(by.id('list-item-last')))
      .toBeVisible()
      .whileElement(by.id('item-list'))
      .scroll(200, 'down');
  });

  it('should pull to refresh', async () => {
    // Pull to refresh gesture
    await element(by.id('item-list')).swipe('down', 'slow', 0.5, 0.5, 0.2);

    // Wait for refresh indicator to disappear
    await waitFor(element(by.id('refresh-indicator')))
      .not.toBeVisible()
      .withTimeout(5000);
  });
});
