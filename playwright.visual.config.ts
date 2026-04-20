import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Visual Regression Configuration (TR-06)
 *
 * Separate config for visual baseline tests to isolate them from functional
 * E2E tests. Key differences from playwright.config.ts:
 *
 *  - testDir points to ./tests/visual
 *  - Animations disabled at the framework level
 *  - Fixed 1280×800 viewport matching the Aurora Dark design spec
 *  - Single worker for deterministic rendering order
 *  - Chromium-only by default; firefox-visual and webkit-visual available
 *    but not required for initial baseline (cross-browser diffs are expected
 *    due to font rendering differences)
 *
 * Usage:
 *   npx playwright test --config playwright.visual.config.ts
 *   npx playwright test --config playwright.visual.config.ts --update-snapshots
 */
export default defineConfig({
  testDir: './tests/visual',

  /* Sequential execution for stable, deterministic snapshots */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,

  /* No retries: visual diffs should fail cleanly, not be silenced */
  retries: 0,

  reporter: [['list'], ['html', { outputFolder: 'playwright-visual-report', open: 'never' }]],

  use: {
    /* Viewport matches the Aurora Dark design (meta viewport=1280) */
    viewport: { width: 1280, height: 800 },

    /* Dark colour scheme matches Aurora Dark design */
    colorScheme: 'dark',

    /* Disable motion at browser level (complements per-test CSS injection) */
    reducedMotion: 'reduce',

    /* Always capture screenshots for visual tests */
    screenshot: 'on',

    trace: 'retain-on-failure',
  },

  /* Snapshot comparison settings */
  expect: {
    toHaveScreenshot: {
      /**
       * Allow a 1 % pixel-ratio tolerance to handle sub-pixel rendering
       * differences across OS/GPU combinations.
       */
      maxDiffPixelRatio: 0.01,

      /**
       * Disable animations inside the snapshot capture itself (belt-and-
       * suspenders alongside the CSS injection in beforeEach).
       */
      animations: 'disabled',

      /**
       * Per-pixel colour threshold (0–1). 0.2 tolerates minor anti-aliasing
       * differences without masking real regressions.
       */
      threshold: 0.2,
    },
  },

  /* Browser projects for visual testing */
  projects: [
    /**
     * Primary baseline browser: Chromium.
     * All baseline screenshots are committed from Chromium runs.
     * Use `--project chromium-visual` for the canonical baseline.
     */
    {
      name: 'chromium-visual',
      use: { ...devices['Desktop Chrome'] },
    },

    /**
     * Firefox visual cross-check.
     * Snapshots stored separately (firefox-visual prefix) because font
     * rendering differs from Chromium. Run ad-hoc, not in standard CI.
     */
    {
      name: 'firefox-visual',
      use: { ...devices['Desktop Firefox'] },
    },

    /**
     * WebKit / Safari visual cross-check (TR-07 coverage).
     * Run ad-hoc or in Phase 3+ Safari CI lane.
     */
    {
      name: 'webkit-visual',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
