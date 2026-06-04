/**
 * Smoke Test Example
 *
 * A minimal smoke test that verifies the application is accessible
 * and core elements are present. Use as a template for new specs.
 *
 * Best practices demonstrated:
 * - Stable selectors (data-testid, role-based)
 * - No fixed sleeps (use auto-wait + assertions)
 * - Environment-agnostic (no hardcoded URLs)
 */
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to base URL (configured in playwright.config.ts)
    await page.goto('/');
  });

  test('homepage loads successfully', async ({ page }) => {
    // Assert page title (adjust to your app)
    await expect(page).toHaveTitle(/My App/i);

    // Assert a stable element is visible using data-testid
    const mainContent = page.getByTestId('main-content');
    await expect(mainContent).toBeVisible();
  });

  test('navigation menu is accessible', async ({ page }) => {
    // Use role-based locators (preferred for accessibility)
    const navigation = page.getByRole('navigation');
    await expect(navigation).toBeVisible();

    // Assert specific nav items exist
    const homeLink = page.getByRole('link', { name: /home/i });
    await expect(homeLink).toBeVisible();
  });

  test('critical user flow is available', async ({ page }) => {
    // Example: Verify a key action button exists
    const primaryAction = page.getByRole('button', { name: /get started/i });
    await expect(primaryAction).toBeVisible();
    await expect(primaryAction).toBeEnabled();
  });
});

test.describe('Health Check', () => {
  test('API health endpoint responds', async ({ request }) => {
    // Direct API call (useful for backend health checks)
    const response = await request.get('/api/health');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});
