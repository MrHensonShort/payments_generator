import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verify the app loads in all configured browsers.
 *
 * data-testid convention: `{component}-{element}` (see CONTRIBUTING.md)
 */

test('app loads and renders root element', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/payments generator/i);
});

test('@safari app loads in WebKit / Safari', async ({ page }) => {
  await page.goto('/');
  // Verify the root element is present; proves WebKit can load the SPA
  await expect(page.locator('#root')).toBeVisible();
});
