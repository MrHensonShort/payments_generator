# Contributing to payments-generator

## `data-testid` Convention (TR-08)

All interactive and semantically significant DOM elements that are referenced in
Playwright E2E tests or Vitest component tests **must** carry a `data-testid`
attribute.

### Format

```
data-testid="{component}-{element}"
```

| Token | Description | Example values |
|---|---|---|
| `component` | Kebab-case name of the React component | `config-panel`, `transaction-table`, `recurring-generator` |
| `element` | Kebab-case role or purpose of the element | `submit-btn`, `date-input`, `error-message`, `row`, `header` |

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
marks tests that are *Phase 3 required* (see [playwright.config.ts](./playwright.config.ts)).

Example:
```ts
test('@safari worker initialisation completes', async ({ page }) => { ... });
```

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

| Browser | Role |
|---|---|
| **Chromium** | Canonical baseline — committed to the repo, used in CI |
| Firefox | Cross-browser ad-hoc check — snapshots not committed by default |
| WebKit | Cross-browser ad-hoc check (@safari coverage, TR-07) |

Chromium renders fonts most consistently across Linux/macOS/Windows CI. Firefox
and WebKit produce expected (non-regression) diffs against the Chromium baseline due
to font hinting differences.

### Phase rollout

| Phase | Views with active baseline tests |
|---|---|
| Phase 0 (now) | Transactions view (design mockup) + sidebar, topbar, kpi-row, table |
| Phase 4a | Settings, Recurring generator — enable skipped tests |
| Phase 4b | Episode generator, Scatter generator — enable skipped tests |
| Phase 5 | Export & Backup — enable skipped test |
| QA-Gate | Full regression suite across all views (QA-04) |

---

## Installing Playwright Browsers

After cloning the repo, run:

```bash
npm install
npx playwright install --with-deps
```

This downloads Chromium, Firefox, and WebKit. Edge uses the system's Microsoft Edge
installation (must be installed separately on Windows/macOS).
