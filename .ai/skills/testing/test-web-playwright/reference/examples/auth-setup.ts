/**
 * Authentication Setup Example
 *
 * Demonstrates how to handle authentication in Playwright tests.
 * Two strategies shown:
 * 1. storageState - Reuse authenticated state across tests
 * 2. API login - Faster than UI login for test setup
 *
 * IMPORTANT: Never commit real credentials. Use environment variables.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

// Path to store authenticated state
const authFile = path.join(__dirname, '../.auth/user.json');

/**
 * Strategy 1: UI Login with Storage State
 *
 * Run this once to create an authenticated state file,
 * then reuse it across all tests.
 *
 * Configure in playwright.config.ts:
 *   projects: [
 *     { name: 'setup', testMatch: /.*\.setup\.ts/ },
 *     {
 *       name: 'chromium',
 *       use: { storageState: authFile },
 *       dependencies: ['setup'],
 *     },
 *   ]
 */
setup('authenticate via UI', async ({ page }) => {
  // Get credentials from environment variables
  const username = process.env.TEST_USER;
  const password = process.env.TEST_PASS;

  if (!username || !password) {
    throw new Error('TEST_USER and TEST_PASS must be set');
  }

  // Navigate to login page
  await page.goto('/login');

  // Fill login form using stable selectors
  await page.getByLabel('Email').fill(username);
  await page.getByLabel('Password').fill(password);

  // Submit and wait for navigation
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for successful login indicator
  await expect(page.getByTestId('user-menu')).toBeVisible();

  // Save authenticated state
  await page.context().storageState({ path: authFile });
});

/**
 * Strategy 2: API Login (faster for test setup)
 *
 * Use this when you need to authenticate without UI interaction.
 * Useful for setting up test data or when UI login is slow.
 */
setup('authenticate via API', async ({ request }) => {
  const username = process.env.TEST_USER;
  const password = process.env.TEST_PASS;

  if (!username || !password) {
    throw new Error('TEST_USER and TEST_PASS must be set');
  }

  // Call login API directly
  const response = await request.post('/api/auth/login', {
    data: {
      email: username,
      password: password,
    },
  });

  expect(response.ok()).toBeTruthy();

  // Token is automatically stored in the request context
  // and will be reused for subsequent requests
});

/**
 * Helper: Create test user via API
 *
 * For tests that need isolated user data.
 * Call this in test.beforeAll() when needed.
 */
export async function createTestUser(request: any) {
  const timestamp = Date.now();
  const testUser = {
    email: `test-${timestamp}@example.com`,
    password: 'TestPassword123!',
    name: `Test User ${timestamp}`,
  };

  const response = await request.post('/api/auth/register', {
    data: testUser,
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test user: ${response.status()}`);
  }

  return testUser;
}

/**
 * Helper: Cleanup test user
 *
 * Call in test.afterAll() to clean up test data.
 */
export async function deleteTestUser(request: any, email: string) {
  await request.delete(`/api/admin/users/${encodeURIComponent(email)}`, {
    headers: {
      Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
    },
  });
}
