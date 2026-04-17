import { test, expect } from '@playwright/test';

/**
 * Phase 4a E2E Tests – UI-Grundgerüst
 *
 * Covers (TR-01 / CLA-52):
 *  1. Tab-Navigation    (P4a-02 / CLA-46): All 6 tabs clickable + URL routing
 *  2. ConfigPanel       (P4a-03 / CLA-47): Field entry + persistence after reload
 *  3. Viewport-Guard    (P4a-06 / CLA-50): Guard shown at < 1 024 px, hidden at ≥ 1 024 px
 *  4. ConfirmModal      (P4a-04 / CLA-48): Open + confirm + cancel via click; cancel via Escape
 *
 * All selectors use `data-testid` attributes per the convention in CONTRIBUTING.md.
 * Tests run on Chromium, Firefox, and WebKit (playwright.config.ts).
 *
 * These tests are acceptance criteria for Phase 4a implementation.
 * They are expected to fail until the Frontend Developer completes CLA-45 – CLA-51.
 */

// ---------------------------------------------------------------------------
// Tab slugs — must match the `data-testid="nav-tab-{slug}"` and URL slug
// agreed in CLA-46.
// ---------------------------------------------------------------------------
const TABS = [
  { testId: 'nav-tab-konfiguration', urlSlug: 'konfiguration' },
  { testId: 'nav-tab-dauerauftraege', urlSlug: 'dauerauftraege' },
  { testId: 'nav-tab-episodisch', urlSlug: 'episodisch' },
  { testId: 'nav-tab-streubuchungen', urlSlug: 'streubuchungen' },
  { testId: 'nav-tab-transaktionen', urlSlug: 'transaktionen' },
  { testId: 'nav-tab-backup', urlSlug: 'backup' },
] as const;

// ---------------------------------------------------------------------------
// 1 · Tab-Navigation
// ---------------------------------------------------------------------------
test.describe('Tab-Navigation (P4a-02 / CLA-46)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app shell to render (at least one nav tab must be present)
    await page.waitForSelector('[data-testid^="nav-tab-"]');
  });

  test('renders all 6 navigation tabs', async ({ page }) => {
    for (const { testId } of TABS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });

  test('clicking each tab changes the URL to include its slug', async ({ page }) => {
    for (const { testId, urlSlug } of TABS) {
      await page.getByTestId(testId).click();
      // Works for both pathname-routing (/konfiguration)
      // and hash-routing (#/konfiguration or #konfiguration).
      await expect(page).toHaveURL(new RegExp(urlSlug));
    }
  });

  test('active tab receives aria-selected="true" or aria-current="page"', async ({ page }) => {
    for (const { testId } of TABS) {
      await page.getByTestId(testId).click();
      const tab = page.getByTestId(testId);
      // Accept either ARIA pattern – implementation may use either.
      const isSelected =
        (await tab.getAttribute('aria-selected')) === 'true' ||
        (await tab.getAttribute('aria-current')) === 'page';
      expect(isSelected, `Tab ${testId} should be marked active`).toBe(true);
    }
  });

  test('@safari all 6 tabs are accessible and clickable in WebKit', async ({ page }) => {
    for (const { testId, urlSlug } of TABS) {
      const tab = page.getByTestId(testId);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page).toHaveURL(new RegExp(urlSlug));
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · ConfigPanel – field entry and persistence
// ---------------------------------------------------------------------------
test.describe('ConfigPanel persistence (P4a-03 / CLA-47)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear persisted state so each test starts from defaults.
    await page.evaluate(() => localStorage.removeItem('app-config'));
    await page.reload();
    // Navigate to the Konfiguration tab.
    await page.waitForSelector('[data-testid="nav-tab-konfiguration"]');
    await page.getByTestId('nav-tab-konfiguration').click();
    // Wait for ConfigPanel to render.
    await page.waitForSelector('[data-testid="config-panel-start-date"]');
  });

  test('all ConfigPanel fields are visible', async ({ page }) => {
    await expect(page.getByTestId('config-panel-start-date')).toBeVisible();
    await expect(page.getByTestId('config-panel-end-date')).toBeVisible();
    await expect(page.getByTestId('config-panel-start-time')).toBeVisible();
    await expect(page.getByTestId('config-panel-end-time')).toBeVisible();
    await expect(page.getByTestId('config-panel-bundesland')).toBeVisible();
    await expect(page.getByTestId('config-panel-seed')).toBeVisible();
    // Payment-mode: either a combined toggle or two separate radio buttons.
    const hasCombined = await page
      .getByTestId('config-panel-payment-mode')
      .isVisible()
      .catch(() => false);
    if (!hasCombined) {
      await expect(page.getByTestId('config-panel-payment-mode-sepa')).toBeVisible();
      await expect(page.getByTestId('config-panel-payment-mode-instant')).toBeVisible();
    }
  });

  test('values persist across a full page reload', async ({ page }) => {
    // --- Fill in non-default values ---
    await page.getByTestId('config-panel-start-date').fill('2024-03-01');
    await page.getByTestId('config-panel-end-date').fill('2024-12-31');
    await page.getByTestId('config-panel-start-time').fill('08:00');
    await page.getByTestId('config-panel-end-time').fill('18:00');
    await page.getByTestId('config-panel-bundesland').selectOption('DE-BE');
    await page.getByTestId('config-panel-seed').fill('42');

    // Switch to Instant payment mode.
    const hasCombined = await page
      .getByTestId('config-panel-payment-mode')
      .isVisible()
      .catch(() => false);
    if (hasCombined) {
      // Toggle switch / select
      const toggle = page.getByTestId('config-panel-payment-mode');
      const tag = await toggle.evaluate((el) => el.tagName.toLowerCase());
      if (tag === 'select') {
        await toggle.selectOption('instant');
      } else {
        // Click the toggle if it's a button/div-based toggle
        await toggle.click();
      }
    } else {
      await page.getByTestId('config-panel-payment-mode-instant').click();
    }

    // Trigger save if a dedicated save button is present (otherwise auto-saves on change).
    const saveBtn = page.getByTestId('config-panel-save-btn');
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    // --- Reload ---
    await page.reload();
    await page.waitForSelector('[data-testid="nav-tab-konfiguration"]');
    await page.getByTestId('nav-tab-konfiguration').click();
    await page.waitForSelector('[data-testid="config-panel-start-date"]');

    // --- Assert persistence ---
    await expect(page.getByTestId('config-panel-start-date')).toHaveValue('2024-03-01');
    await expect(page.getByTestId('config-panel-end-date')).toHaveValue('2024-12-31');
    await expect(page.getByTestId('config-panel-start-time')).toHaveValue('08:00');
    await expect(page.getByTestId('config-panel-end-time')).toHaveValue('18:00');
    await expect(page.getByTestId('config-panel-bundesland')).toHaveValue('DE-BE');
    await expect(page.getByTestId('config-panel-seed')).toHaveValue('42');

    // Assert payment mode persisted to Instant.
    if (hasCombined) {
      const toggle = page.getByTestId('config-panel-payment-mode');
      const tag = await toggle.evaluate((el) => el.tagName.toLowerCase());
      if (tag === 'select') {
        await expect(toggle).toHaveValue('instant');
      } else {
        // Data attribute or aria-pressed style – check for 'instant' presence.
        const value =
          (await toggle.getAttribute('data-value')) ??
          (await toggle.getAttribute('aria-pressed')) ??
          (await toggle.getAttribute('data-state'));
        expect(value).toMatch(/instant/i);
      }
    } else {
      await expect(page.getByTestId('config-panel-payment-mode-instant')).toBeChecked();
    }
  });

  test('persisted values survive navigation away and back', async ({ page }) => {
    await page.getByTestId('config-panel-start-date').fill('2025-06-01');
    await page.getByTestId('config-panel-end-date').fill('2025-06-30');

    const saveBtn = page.getByTestId('config-panel-save-btn');
    if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();

    // Navigate away
    await page.getByTestId('nav-tab-transaktionen').click();
    // Navigate back
    await page.getByTestId('nav-tab-konfiguration').click();
    await page.waitForSelector('[data-testid="config-panel-start-date"]');

    await expect(page.getByTestId('config-panel-start-date')).toHaveValue('2025-06-01');
    await expect(page.getByTestId('config-panel-end-date')).toHaveValue('2025-06-30');
  });
});

// ---------------------------------------------------------------------------
// 3 · Viewport-Guard
// ---------------------------------------------------------------------------
test.describe('Viewport-Guard (P4a-06 / CLA-50)', () => {
  test('guard is visible at 800 px width (< 1 024 px threshold)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 768 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-guard')).toBeVisible();
  });

  test('guard is hidden at 1 280 px width (≥ 1 024 px threshold)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    // Guard must either not exist or be invisible.
    const guard = page.getByTestId('viewport-guard');
    await expect(guard).not.toBeVisible();
  });

  test('guard appears when window is resized below 1 024 px', async ({ page }) => {
    // Start wide
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-guard')).not.toBeVisible();

    // Shrink
    await page.setViewportSize({ width: 800, height: 768 });
    await expect(page.getByTestId('viewport-guard')).toBeVisible();
  });

  test('guard disappears when window is resized above 1 024 px', async ({ page }) => {
    // Start narrow
    await page.setViewportSize({ width: 800, height: 768 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-guard')).toBeVisible();

    // Expand
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('viewport-guard')).not.toBeVisible();
  });

  test('guard text informs user about the minimum width requirement', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 768 });
    await page.goto('/');
    const guard = page.getByTestId('viewport-guard');
    await expect(guard).toBeVisible();
    // Message must mention 1.024 px (with dot or comma as thousands separator)
    // or at least contain "1024" or "1.024" or "desktop".
    await expect(guard).toContainText(/1[.,]?024|desktop/i);
  });

  test('@safari viewport-guard renders correctly in WebKit', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 768 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-guard')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('viewport-guard')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4 · ConfirmModal
// ---------------------------------------------------------------------------
/**
 * The ConfirmModal is opened via the "Konfiguration zurücksetzen" (Reset Config)
 * button in the ConfigPanel — a destructive action that requires confirmation.
 *
 * Required data-testid attributes (CLA-48):
 *   confirm-modal          – the dialog/overlay element
 *   confirm-modal-confirm  – the confirm / destructive action button
 *   confirm-modal-cancel   – the cancel / dismiss button
 *   config-panel-reset-btn – the trigger button in ConfigPanel
 */
test.describe('ConfirmModal (P4a-04 / CLA-48)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="nav-tab-konfiguration"]');
    await page.getByTestId('nav-tab-konfiguration').click();
    await page.waitForSelector('[data-testid="config-panel-reset-btn"]');
  });

  test('modal is not visible before being triggered', async ({ page }) => {
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();
  });

  test('clicking the reset button opens the ConfirmModal', async ({ page }) => {
    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
  });

  test('clicking the Cancel button closes the modal without action', async ({ page }) => {
    // Record current start-date value
    await page.getByTestId('config-panel-start-date').fill('2024-01-01');
    const saveBtn = page.getByTestId('config-panel-save-btn');
    if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();

    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();

    // Click Cancel
    await page.getByTestId('confirm-modal-cancel').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Value should remain unchanged
    await expect(page.getByTestId('config-panel-start-date')).toHaveValue('2024-01-01');
  });

  test('pressing Escape closes the modal without action', async ({ page }) => {
    await page.getByTestId('config-panel-start-date').fill('2024-01-01');
    const saveBtn = page.getByTestId('config-panel-save-btn');
    if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();

    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Value should remain unchanged
    await expect(page.getByTestId('config-panel-start-date')).toHaveValue('2024-01-01');
  });

  test('clicking the Confirm button closes the modal and resets config', async ({ page }) => {
    // Set a non-default value
    await page.getByTestId('config-panel-start-date').fill('2024-01-01');
    const saveBtn = page.getByTestId('config-panel-save-btn');
    if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();

    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();

    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // After reset, the start-date field should revert to the default
    // (Jan 1 of the current year) — not to 2024-01-01.
    const currentYear = new Date().getFullYear();
    const defaultStartDate = `${currentYear}-01-01`;
    await expect(page.getByTestId('config-panel-start-date')).toHaveValue(defaultStartDate);
  });

  test('modal can be opened, closed, and re-opened correctly', async ({ page }) => {
    // Open → cancel
    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-cancel').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Open again via Escape
    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Open again → confirm
    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();
  });

  test('@safari ConfirmModal open/close works in WebKit', async ({ page }) => {
    await page.getByTestId('config-panel-reset-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();

    await page.getByTestId('confirm-modal-cancel').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();
  });
});
