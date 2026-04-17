import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * Visual Regression Tests – Aurora Dark Baseline (TR-06)
 *
 * Baseline source: designs/design-2-aurora.html (CLA-10 Aurora Dark Mockups)
 *
 * These tests capture baseline screenshots of all main application views.
 * Screenshots are stored in tests/visual/visual.spec.ts-snapshots/ and
 * committed to the repository.
 *
 * Run comparison:
 *   npx playwright test --config playwright.visual.config.ts
 *
 * Regenerate baseline:
 *   ./tests/visual/baseline-create.sh
 *
 * For detailed documentation on baseline maintenance see CONTRIBUTING.md.
 */

const DESIGN_FILE = path.resolve('./designs/design-2-aurora.html');
const DESIGN_URL = `file://${DESIGN_FILE}`;

/**
 * Disable all CSS animations and transitions for stable, deterministic
 * screenshots. The Aurora Dark design includes a blinking DB-status dot
 * and hover/focus transitions that would cause flaky diffs.
 */
async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 0: Baseline screenshots derived from the Aurora Dark design mockup.
//
// The design HTML (designs/design-2-aurora.html) represents the CLA-10
// approved Aurora Dark visual style. It shows the "Transaktionen" view
// as the active panel, which is the primary richest view in the mockup.
//
// When the real app is implemented (Phase 4a+), the test.skip() blocks
// below should be enabled and pointed at the running application.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Aurora Dark — Visual Baseline (TR-06)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DESIGN_URL);
    await disableAnimations(page);
    // Allow fonts and layout a brief settle window (web fonts via Google Fonts
    // may not load in file:// context, but system fallbacks render immediately).
    await page.waitForLoadState('domcontentloaded');
  });

  // ── Full-page baseline ───────────────────────────────────────────────────

  test('transactions view — full page @visual', async ({ page }) => {
    await expect(page).toHaveScreenshot('transactions-full.png', {
      fullPage: true,
    });
  });

  // ── Component-level baselines ────────────────────────────────────────────

  test('sidebar navigation @visual', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveScreenshot('sidebar.png');
  });

  test('topbar with actions @visual', async ({ page }) => {
    const topbar = page.locator('.topbar');
    await expect(topbar).toHaveScreenshot('topbar.png');
  });

  test('kpi summary row @visual', async ({ page }) => {
    const kpiRow = page.locator('.kpi-row');
    await expect(kpiRow).toHaveScreenshot('kpi-row.png');
  });

  test('transaction table @visual', async ({ page }) => {
    const tableWrap = page.locator('.table-wrap');
    await expect(tableWrap).toHaveScreenshot('table.png');
  });

  // ── Placeholders for views implemented in Phase 4a+ ─────────────────────
  //
  // Enable these tests once the corresponding React views are built.
  // Replace the DESIGN_URL goto with `page.goto('/')` and add the
  // appropriate navigation click before the screenshot assertion.

  test.skip('settings view — full page @visual', async ({ page }) => {
    // TODO Phase 4a: await page.goto('/');
    // await page.click('[data-testid="nav-settings"]');
    await expect(page).toHaveScreenshot('settings-full.png', { fullPage: true });
  });

  test.skip('recurring generator view — full page @visual', async ({ page }) => {
    // TODO Phase 4a: await page.goto('/');
    // await page.click('[data-testid="nav-recurring"]');
    await expect(page).toHaveScreenshot('recurring-full.png', { fullPage: true });
  });

  test.skip('episode generator view — full page @visual', async ({ page }) => {
    // TODO Phase 4b: await page.goto('/');
    // await page.click('[data-testid="nav-episodes"]');
    await expect(page).toHaveScreenshot('episodes-full.png', { fullPage: true });
  });

  test.skip('scatter generator view — full page @visual', async ({ page }) => {
    // TODO Phase 4b: await page.goto('/');
    // await page.click('[data-testid="nav-scatter"]');
    await expect(page).toHaveScreenshot('scatter-full.png', { fullPage: true });
  });

  test.skip('export & backup view — full page @visual', async ({ page }) => {
    // TODO Phase 5: await page.goto('/');
    // await page.click('[data-testid="nav-export"]');
    await expect(page).toHaveScreenshot('export-full.png', { fullPage: true });
  });
});
