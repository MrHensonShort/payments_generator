import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Browser projects:
 *  - chromium  (Chrome)
 *  - firefox
 *  - webkit    (Safari / WebKit) — required for @safari-tagged tests (TR-07)
 *  - edge      (Chromium-based, msedge channel)
 *
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Use fewer workers on CI to avoid resource contention */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['html', { outputFolder: 'playwright-report', open: 'on-failure' }]],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording on retry */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    /**
     * TR-07: WebKit / Safari
     * Tests tagged with @safari are required to pass on this browser project.
     * Use the @safari tag on any test that must be verified for Safari compatibility.
     *
     * Example:
     *   test('@safari worker initialisation', async ({ page }) => { ... });
     */
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      /* Run all tests plus any explicitly tagged @safari tests */
      grep: /(@safari|.*)/,
    },

    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
