import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global setup file: configures fake-indexeddb IDB mock
    setupFiles: ['./vitest.setup.ts'],
    // Enable global APIs (describe, it, expect) without imports
    globals: true,
    environment: 'node',
    // Exclude browser-mode and Playwright E2E/visual tests from the Node runner.
    // These require the browser config (vitest.browser.config.ts) or Playwright directly.
    exclude: [
      'tests/e2e/**',
      'tests/visual/**',
      'tests/workers/**/*.browser.test.ts',
      'node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/test/**'],
      thresholds: {
        // Global minimum – covers Infrastructure Layer (≥ 80%) and any
        // other source code not matched by a more specific glob below.
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Domain Layer must meet the higher 90 % target (TR-03).
        // Vitest aggregates coverage for all files matching this glob and
        // fails the run if any metric falls below the threshold.
        'src/domain/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
