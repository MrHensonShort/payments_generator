# Contributing to payments-generator

## `data-testid` Convention (TR-08)

All interactive and semantically significant DOM elements that are referenced in
Playwright E2E tests or Vitest component tests **must** carry a `data-testid`
attribute.

### Format

```
data-testid="{component}-{element}"
```

| Token       | Description                               | Example values                                               |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| `component` | Kebab-case name of the React component    | `config-panel`, `transaction-table`, `recurring-generator`   |
| `element`   | Kebab-case role or purpose of the element | `submit-btn`, `date-input`, `error-message`, `row`, `header` |

### Examples

```tsx
// ConfigPanel.tsx
<input data-testid="config-panel-start-date" ... />
<input data-testid="config-panel-end-date" ... />
<select data-testid="config-panel-state-selector" ... />
<button data-testid="config-panel-generate-btn" ... />

// TransactionTable.tsx
<table data-testid="transaction-table-root" ... />
<tr data-testid="transaction-table-row" ... />

// ConfirmModal.tsx
<dialog data-testid="confirm-modal-dialog" ... />
<button data-testid="confirm-modal-confirm-btn" ... />
<button data-testid="confirm-modal-cancel-btn" ... />

// ProgressBar.tsx
<div data-testid="progress-bar-root" ... />
<button data-testid="progress-bar-cancel-btn" ... />
```

### Rules

1. **Required** on all elements targeted by `page.locator('[data-testid="..."]')` in
   Playwright tests.
2. **Required** on all elements targeted by `getByTestId` in Vitest component tests.
3. **Do not** use `data-testid` on purely decorative or layout elements.
4. Keep `component` stable: renaming a component means renaming its `data-testid`
   prefix and updating all tests that reference it.
5. `element` tokens must be unique within a single component.

### Safari / WebKit (@safari tag)

Tests that must be verified for Safari compatibility are tagged with `@safari` in
their test name. The Playwright `webkit` project runs all tests; the `@safari` tag
marks tests that are _Phase 3 required_ (see [playwright.config.ts](./playwright.config.ts)).

Example:

```ts
test('@safari worker initialisation completes', async ({ page }) => { ... });
```

---

## Web Worker Test Strategy (TR-04)

The payments-generator uses a Comlink-based Web Worker (`src/workers/generationWorker.ts`,
implemented in Phase 3) for long-running transaction generation. Testing this worker
requires two separate strategies depending on what is being tested.

### 1 · Unit Tests — Comlink Mock (fast, Node environment)

For any component or service that _talks to_ the worker (e.g. `GenerationOrchestrator`,
`WorkerProxy`), use the in-process Comlink mock instead of a real Worker. The mock lives
at `__mocks__/generationWorker.ts` (project root).

**Importing the mock in a test file:**

```ts
import {
  mockGenerationWorkerAPI, // shared spy instance
  createFreshWorkerMock, // isolated spy per test
  createQuotaExceededMock, // simulates IDB quota exhaustion
  type GenerationWorkerAPI,
  type GenerationConfig,
  type GenerationProgressEvent,
} from '__mocks__/generationWorker';
```

**Canonical pattern — isolated spy per test:**

```ts
import { createFreshWorkerMock, type GenerationWorkerAPI } from '__mocks__/generationWorker';

let worker: GenerationWorkerAPI;

beforeEach(() => {
  worker = createFreshWorkerMock();
});

it('calls generate with the correct rule IDs', async () => {
  const onProgress = vi.fn();
  await worker.generate(['rule-1', 'rule-2'], config, onProgress);

  expect(worker.generate).toHaveBeenCalledOnce();
  expect(onProgress).toHaveBeenCalledTimes(2);
});
```

**Testing abort behaviour:**

```ts
it('surfaces AbortError when signal is cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  const worker = createFreshWorkerMock();

  await expect(worker.generate(['r1'], config, () => {}, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
```

**Testing QuotaExceededError propagation:**

```ts
it('propagates QuotaExceededError from IDB', async () => {
  const worker = createQuotaExceededMock(0); // throws on first rule

  await expect(worker.generate(['r1', 'r2'], config, () => {})).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
});
```

The full demo suite lives in
`src/workers/__tests__/generationWorker-mock.test.ts` and runs with the
standard `npm test` command.

### 2 · Browser Integration Tests — Vitest Browser Mode (real Worker API)

For tests that need the actual `Worker` constructor, real Comlink message
passing, or cross-origin isolation features, use the browser-mode config.

**Configuration:** `vitest.browser.config.ts`  
**Test location:** `tests/workers/**/*.browser.test.ts`  
**Provider:** Playwright (reuses the existing Playwright installation)

**Install prerequisites (once):**

```bash
npm install -D @vitest/browser
# Playwright browsers are already installed via @playwright/test
```

**Running browser tests:**

```bash
# Chromium (primary)
npx vitest run --config vitest.browser.config.ts

# WebKit / Safari (TR-07 - @safari tag)
npx vitest run --config vitest.browser.config.ts --project=webkit
```

**Phase rollout for browser tests:**

| Phase           | Tests enabled                                                        |
| --------------- | -------------------------------------------------------------------- |
| Phase 0 (now)   | `Worker` constructor availability check only                         |
| Phase 3 (P3-04) | Real worker init, Comlink message passing, abort, QuotaExceededError |

Scaffold tests with `test.skip` are in
`tests/workers/generationWorker.browser.test.ts` — remove the `skip` when
Phase 3 delivers the real worker.

### Decision record

| #   | Decision                                             | Rationale                                                                                                              |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Mock lives at `__mocks__/generationWorker.ts` (root) | Vitest resolves root `__mocks__` for manual mocks; placing it here makes the import path predictable across all layers |
| 2   | Mock methods are `vi.fn()` wrappers                  | Allows call-count assertions in consumer tests without extra setup                                                     |
| 3   | Browser tests use Playwright provider                | Reuses existing `@playwright/test` install; no extra browser downloads                                                 |
| 4   | Chromium + WebKit both run in CI                     | Ensures Safari compatibility is caught before Phase-3 completion                                                       |

---

## Running Tests

```bash
# Unit tests (Vitest)
npm test

# Unit tests with coverage
npm run test:coverage

# E2E tests (Playwright — all browsers)
npm run e2e

# E2E tests with interactive UI
npm run e2e:ui

# E2E tests headed (visible browser)
npm run e2e:headed

# Open last E2E report
npm run e2e:report
```

## Visual Regression Tests (TR-06)

Visual regression tests compare screenshots of the application against a committed
baseline derived from the **Aurora Dark** design mockups (CLA-10).

Configuration: `playwright.visual.config.ts`
Test suite: `tests/visual/visual.spec.ts`
Baseline snapshots: `tests/visual/visual.spec.ts-snapshots/`

### Running comparison tests

```bash
npx playwright test --config playwright.visual.config.ts
```

Failed tests produce a diff image in `playwright-visual-report/`. Open the report with:

```bash
npx playwright show-report playwright-visual-report
```

### Creating or updating the baseline

Use the provided script to regenerate baseline screenshots:

```bash
# Make executable once after cloning
chmod +x tests/visual/baseline-create.sh

# Regenerate Chromium baseline (canonical — use for most updates)
./tests/visual/baseline-create.sh

# Regenerate a specific browser baseline
./tests/visual/baseline-create.sh --browser firefox
./tests/visual/baseline-create.sh --browser webkit

# Regenerate all browsers
./tests/visual/baseline-create.sh --browser all

# Regenerate only tests matching a keyword
VISUAL_GREP="kpi" ./tests/visual/baseline-create.sh
```

After running, commit the updated snapshots:

```bash
git add tests/visual/visual.spec.ts-snapshots/
git commit -m "chore(visual): update Aurora Dark baseline [TR-06]"
```

### When to update the baseline

Update the committed baseline when:

- **An intentional UI change lands** — design tokens change, layout adjusts, or a
  component is redesigned to match an updated Aurora Dark spec.
- **A new view is implemented** — enable its `test.skip()` block in
  `tests/visual/visual.spec.ts`, point it at the running app, and run
  `baseline-create.sh` to seed the snapshot.

Do **not** update the baseline to silence a failing test unless the visual difference
is intentional. Unexpected diffs indicate a regression.

### Baseline browser policy

| Browser      | Role                                                            |
| ------------ | --------------------------------------------------------------- |
| **Chromium** | Canonical baseline — committed to the repo, used in CI          |
| Firefox      | Cross-browser ad-hoc check — snapshots not committed by default |
| WebKit       | Cross-browser ad-hoc check (@safari coverage, TR-07)            |

Chromium renders fonts most consistently across Linux/macOS/Windows CI. Firefox
and WebKit produce expected (non-regression) diffs against the Chromium baseline due
to font hinting differences.

### Phase rollout

| Phase         | Views with active baseline tests                                    |
| ------------- | ------------------------------------------------------------------- |
| Phase 0 (now) | Transactions view (design mockup) + sidebar, topbar, kpi-row, table |
| Phase 4a      | Settings, Recurring generator — enable skipped tests                |
| Phase 4b      | Episode generator, Scatter generator — enable skipped tests         |
| Phase 5       | Export & Backup — enable skipped test                               |
| QA-Gate       | Full regression suite across all views (QA-04)                      |

---

## Installing Playwright Browsers

After cloning the repo, run:

```bash
npm install
npx playwright install --with-deps
```

This downloads Chromium, Firefox, and WebKit. Edge uses the system's Microsoft Edge
installation (must be installed separately on Windows/macOS).
