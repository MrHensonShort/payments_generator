/**
 * vitest.browser.config.ts
 *
 * Vitest Browser Mode – Worker Integration Tests (TR-04)
 * ───────────────────────────────────────────────────────
 * This configuration runs integration tests that exercise the real Web Worker
 * API inside an actual browser runtime.  It complements (not replaces) the
 * main `vitest.config.ts`, which uses a Node/jsdom environment for fast unit
 * tests with mocks.
 *
 * ── When to use this config ─────────────────────────────────────────────────
 *  - Tests in `tests/workers/` that require a live `Worker` constructor,
 *    real Comlink message passing, or genuine browser APIs (e.g. SharedArrayBuffer).
 *  - Phase-3 smoke tests for `generationWorker.ts` (P3-04 / P3-06).
 *  - Do NOT use for unit tests – those belong in `vitest.config.ts`.
 *
 * ── Install prerequisites (once) ────────────────────────────────────────────
 *  npm install -D @vitest/browser
 *  npx playwright install chromium webkit          # providers already installed via @playwright/test
 *
 * ── Running browser tests ───────────────────────────────────────────────────
 *  npm run test:browser                            # Chromium (default)
 *  npm run test:browser -- --project=webkit        # WebKit / Safari (TR-07)
 *
 * ── CI ──────────────────────────────────────────────────────────────────────
 *  The GitHub Actions workflow runs this config in headless mode via:
 *    npx vitest run --config vitest.browser.config.ts
 *  Both the `chromium` and `webkit` projects are executed so Safari
 *  compatibility is verified in every CI run.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ── Browser provider ──────────────────────────────────────────────────
    // Requires `@vitest/browser` (see install note above).
    // The `playwright` provider reuses the Playwright installation already
    // present for E2E tests – no extra browser downloads needed.
    browser: {
      enabled: true,
      provider: 'playwright',
      // headless: true is the default in CI; set to false for local debugging.
      headless: true,
    },

    // ── Multi-project: Chromium + WebKit ─────────────────────────────────
    // Chromium is the primary browser for worker tests.
    // WebKit exercises Safari compatibility (TR-07 / @safari).
    projects: [
      {
        name: 'chromium',
        test: {
          browser: {
            name: 'chromium',
          },
          include: ['tests/workers/**/*.browser.test.ts'],
        },
      },
      {
        name: 'webkit',
        test: {
          browser: {
            name: 'webkit',
          },
          // Only Phase-3-required (@safari) worker tests run under WebKit.
          include: ['tests/workers/**/*.browser.test.ts'],
        },
      },
    ],

    // ── Coverage (optional for browser tests) ────────────────────────────
    // Coverage in browser mode requires the istanbul provider.
    // Uncomment when @vitest/coverage-istanbul is installed:
    // coverage: {
    //   provider: 'istanbul',
    //   include: ['src/workers/**/*.ts'],
    //   exclude: ['src/workers/**/*.test.ts'],
    //   thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    // },

    // ── Globals ───────────────────────────────────────────────────────────
    globals: true,
  },
});
