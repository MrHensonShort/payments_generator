/**
 * tests/workers/generationWorker.browser.test.ts
 *
 * Browser-mode integration tests for the real generationWorker (TR-04 / P3-04).
 *
 * ── Status ───────────────────────────────────────────────────────────────────
 * These tests are SKIPPED until Phase 3 delivers `src/workers/generationWorker.ts`
 * (P3-04).  Remove the `test.skip` wrappers when the real worker exists.
 *
 * ── Known Issues (CLA-41 / 2026-04-17) ──────────────────────────────────────
 *
 * KI-01 · Real worker not yet implemented (P3-04 pending)
 *   `src/workers/generationWorker.ts` does not exist yet.  All Phase-3 tests
 *   that instantiate the real Worker are kept as `test.skip` until P3-04 lands.
 *   Comlink is also not yet in package.json; add it with:
 *     npm install comlink
 *
 * KI-02 · @vitest/browser not installed
 *   Browser-mode tests require `@vitest/browser`:
 *     npm install -D @vitest/browser
 *   Without it, `npx vitest run --config vitest.browser.config.ts` fails at
 *   startup.  The non-browser unit tests (`npm test`) are unaffected.
 *
 * KI-03 · WebKit system libraries missing from CI/dev host
 *   Running `npx playwright install webkit` succeeds (binary downloaded), but
 *   the host is missing ~70 shared libraries (libgstreamer, libgtk-4, libpango,
 *   libharfbuzz, libvulkan, libwayland, etc.).  WebKit cannot launch until the
 *   host OS provides these dependencies via:
 *     npx playwright install-deps webkit
 *   or by switching to a Docker image with full WebKit support (e.g.
 *   mcr.microsoft.com/playwright:v1.44.0-jammy).
 *   Chromium is also uninstalled on this host; install with:
 *     npx playwright install chromium
 *
 * KI-04 · 2 pre-existing unit test failures in generationWorker-mock.test.ts
 *   Found during CLA-41 QA run.  Both failures are in the Node unit test suite
 *   and do not affect browser tests directly, but they leave `npm test` at
 *   exit-code 1:
 *
 *   a) "generate() is a vi.fn() spy – call assertions work"
 *      The assertion includes `undefined` as a 4th argument (signal), but the
 *      test calls generate() with only 3 args.  Vitest records 3-element arg
 *      arrays, so `toHaveBeenCalledWith(..., undefined)` fails.
 *      Fix: remove `undefined` from the `toHaveBeenCalledWith` expectation.
 *
 *   b) "returns an independent spy not shared with mockGenerationWorkerAPI"
 *      `createFreshWorkerMock()` currently passes `mockGenerationWorkerAPI.generate`
 *      (the shared spy) as the implementation of the fresh `vi.fn()`.  Every call
 *      to a fresh mock therefore also records on the shared spy, breaking the
 *      isolation assertion.
 *      Fix: extract the generate logic to a standalone `generateImpl()` function
 *      and use it as the implementation in both the shared mock and fresh mocks.
 *
 * ── Environment ──────────────────────────────────────────────────────────────
 * Runs in a real browser via `vitest.browser.config.ts` (Playwright provider).
 * Do NOT run this file with the standard `vitest.config.ts` (Node environment).
 *
 * ── Running ───────────────────────────────────────────────────────────────────
 *   npm run test:browser
 *   npm run test:browser -- --project=webkit   # Safari (@safari tag, TR-07)
 */

describe('generationWorker (browser integration – TR-04)', () => {
  // ── Prerequisite: Worker API is available ─────────────────────────────────
  it('Worker constructor is available in this browser context', () => {
    // This test must always be enabled – it validates the browser environment.
    expect(typeof Worker).toBe('function');
  });

  // ── Phase-3 tests (skipped until P3-04 is complete) ──────────────────────
  // See KI-01 above for the full blocker description.

  test.skip('@safari worker initialisation completes (Phase 3)', async () => {
    // TODO (P3-04): Instantiate the real generationWorker via Comlink,
    // verify that the Worker starts without error, and that Comlink can
    // communicate across the Worker boundary in both Chromium and WebKit.
    //
    // Prerequisites:
    //   npm install comlink
    //   npm install -D @vitest/browser
    //   npx playwright install-deps webkit
    //
    // Example skeleton:
    // import * as Comlink from 'comlink';
    // import type { GenerationWorkerAPI } from '../../src/workers/generationWorker';
    //
    // const worker = new Worker(
    //   new URL('../../src/workers/generationWorker', import.meta.url),
    //   { type: 'module' },
    // );
    // const api = Comlink.wrap<GenerationWorkerAPI>(worker);
    // const config = { startDate: '2024-01-01', endDate: '2024-01-31', seed: 1 };
    // const result = await api.generate([], config, Comlink.proxy(() => {}));
    // expect(result).toBeDefined();
    // worker.terminate();
  });

  test.skip('@safari progress events flow from Worker to main thread (Phase 3)', async () => {
    // TODO (P3-04): Verify that progress callbacks (Comlink.proxy(cb)) are
    // called with correct GenerationProgressEvent shapes during generation.
    //
    // import * as Comlink from 'comlink';
    // const worker = new Worker(
    //   new URL('../../src/workers/generationWorker', import.meta.url),
    //   { type: 'module' },
    // );
    // const api = Comlink.wrap<GenerationWorkerAPI>(worker);
    // const events: GenerationProgressEvent[] = [];
    // const config = { startDate: '2024-01-01', endDate: '2024-01-31', seed: 1 };
    // await api.generate(['rule-1', 'rule-2'], config, Comlink.proxy((e) => events.push(e)));
    // expect(events.length).toBeGreaterThan(0);
    // expect(events[events.length - 1].percentage).toBe(100);
    // worker.terminate();
  });

  test.skip('@safari AbortController cancels Worker generation (Phase 3)', async () => {
    // TODO (P3-04): Start generation with many rules, abort mid-way,
    // and assert that DOMException AbortError is thrown.
  });

  test.skip('@safari QuotaExceededError is propagated across the Worker boundary (Phase 3)', async () => {
    // TODO (P3-04): Fill IDB to capacity (or mock), trigger generation,
    // and assert that QuotaExceededError surfaces on the main thread.
  });
});
