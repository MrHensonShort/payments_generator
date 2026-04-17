import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global setup file: configures fake-indexeddb IDB mock
    setupFiles: ['./vitest.setup.ts'],
    // Enable global APIs (describe, it, expect) without imports
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/test/**'],
      thresholds: {
        // Domain Layer ≥ 90%, Infrastructure ≥ 80% (TR-03)
        // Configured here as project-level defaults; per-folder thresholds
        // can be added once the directory structure is established.
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
