import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 4b E2E Tests – Generator-Formulare + Tabelle
 *
 * Covers (TR-01 / CLA-62):
 *  1. TC-10 (CLA-11): Recurring End-to-End – rule creation → generate → verify in TransactionTable
 *  2. Virtual Scrolling: TransactionTable with 5 000+ rows – scroll without freeze (P4b-05)
 *  3. KPI Correctness: Sums after generation match manually calculated values (P4b-07)
 *  4. Edit/Delete Flow: Inline edit + delete with ConfirmModal (P4b-08)
 *
 * All selectors use `data-testid` attributes per the convention in CONTRIBUTING.md.
 * Tests run on Chromium, Firefox, and WebKit (playwright.config.ts).
 *
 * Acceptance criteria for Phase 4b implementation.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DauerauftraegePage data-testid contracts (P4b-01 – implemented in CLA-53):
 *   dauerauftraege-page          – page root
 *   recurring-name               – rule name input
 *   recurring-counterparty       – counterparty input
 *   recurring-purpose            – Verwendungszweck input
 *   recurring-category           – category SelectTrigger
 *   recurring-transaction-type   – income/expense/transfer SelectTrigger
 *   recurring-amount-mode-select – AmountConfigField mode selector
 *   recurring-amount-fix-value   – AmountConfigField fixed amount input (default mode)
 *   recurring-cycle              – cycle period SelectTrigger (monthly/quarterly/…)
 *   recurring-day-of-month       – day-of-month Input
 *   recurring-booking-day-type   – booking day type SelectTrigger
 *   recurring-submit             – add / update rule button
 *   recurring-cancel             – cancel edit button (only in edit mode)
 *   recurring-generate-btn       – trigger generation button
 *   recurring-progress           – generation progress wrapper div (visible while generating)
 *   progress-bar                 – ProgressBar component inside recurring-progress
 *   recurring-gen-result         – success/error message after generation (visible after done)
 *   recurring-empty              – empty-state placeholder (no rules)
 *   recurring-rule-list          – rule list container
 *   recurring-rule-item-{id}     – individual rule card (one per rule)
 *   recurring-edit-{id}          – edit button per rule card
 *   recurring-delete-{id}        – delete button per rule card
 *
 * TransaktionenPage data-testid contracts (P4b-05 – P4b-08, pending implementation):
 *   transaction-table            – TransactionTable container
 *   transaction-table-row        – individual row (one per transaction)
 *   transaction-table-empty      – empty-state placeholder
 *   kpi-income                   – KPI Einnahmen total
 *   kpi-expense                  – KPI Ausgaben total
 *   kpi-balance                  – KPI Saldo
 *   filter-bar-text              – free-text filter input
 *   filter-bar-type              – source-type filter
 *   transaction-edit-btn         – edit button per row
 *   transaction-delete-btn       – delete button per row
 *   transaction-edit-modal       – inline-edit modal container
 *   transaction-edit-modal-purpose  – purpose field in edit modal
 *   transaction-edit-modal-amount   – amount field in edit modal
 *   transaction-edit-modal-save-btn    – save button in edit modal
 *   transaction-edit-modal-cancel-btn  – cancel button in edit modal
 *   confirm-modal                – shared ConfirmModal (P4a reuse)
 *   confirm-modal-confirm        – confirm/destructive action button
 *   confirm-modal-cancel         – cancel/dismiss button
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to a named tab and wait for URL to include its slug. */
async function goToTab(page: Page, slug: string): Promise<void> {
  await page.getByTestId(`nav-tab-${slug}`).click();
  await expect(page).toHaveURL(new RegExp(slug));
}

/**
 * Set the global date range via the Konfiguration tab.
 * Clears persisted state first so every test starts from a known baseline.
 */
async function setGlobalConfig(
  page: Page,
  opts: { startDate: string; endDate: string },
): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('app-config'));
  await page.reload();
  await page.waitForSelector('[data-testid^="nav-tab-"]');
  await goToTab(page, 'konfiguration');
  await page.waitForSelector('[data-testid="config-panel-start-date"]');
  await page.getByTestId('config-panel-start-date').fill(opts.startDate);
  await page.getByTestId('config-panel-end-date').fill(opts.endDate);
  const saveBtn = page.getByTestId('config-panel-save-btn');
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  }
}

/**
 * Helper: open a shadcn/ui Select by its trigger testid and pick an option.
 *
 * shadcn Select renders as a Radix Popover.  The `<option>` elements are not
 * native `<select>` options, so we click the trigger and then pick by role.
 */
async function selectOption(page: Page, triggerTestId: string, value: string): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  // Options are rendered with role="option" in the Radix portal.
  await page.getByRole('option', { name: value, exact: false }).first().click();
}

/**
 * Fill and submit the RecurringGenerator form.
 *
 * Expects the Daueraufträge tab to already be active and the form to be ready.
 * Uses the testid conventions from DauerauftraegePage (CLA-53).
 */
interface RecurringFormValues {
  name: string;
  counterparty: string;
  purpose: string;
  /** Category label as displayed in the UI (e.g. "Miete"). */
  category: string;
  transactionType: 'Einnahme' | 'Ausgabe' | 'Transfer';
  /** Amount as a positive decimal string in "fix" mode (e.g. "150.00"). */
  amount: string;
  /** Cycle label as displayed in the UI (e.g. "Monatlich"). */
  cycle: string;
  dayOfMonth: string;
  /** Booking day type label as shown in the UI (e.g. "Fix (exakter Kalendertag)"). */
  bookingDayType?: string;
}

async function fillRecurringForm(page: Page, values: RecurringFormValues): Promise<void> {
  await page.waitForSelector('[data-testid="recurring-name"]');

  await page.getByTestId('recurring-name').fill(values.name);
  await page.getByTestId('recurring-counterparty').fill(values.counterparty);
  await page.getByTestId('recurring-purpose').fill(values.purpose);
  await page.getByTestId('recurring-day-of-month').fill(values.dayOfMonth);

  // Transaction type (shadcn Select).
  await selectOption(page, 'recurring-transaction-type', values.transactionType);

  // Amount in "fix" mode (the AmountConfigField defaults to "fix" mode).
  // If the mode select is visible and not already on "fix", switch it first.
  const modeSelect = page.getByTestId('recurring-amount-mode-select');
  if (await modeSelect.isVisible().catch(() => false)) {
    const currentMode = await modeSelect.getAttribute('data-value').catch(() => '');
    if (currentMode !== 'fix') {
      await selectOption(page, 'recurring-amount-mode-select', 'fix');
    }
  }
  await page.getByTestId('recurring-amount-fix-value').fill(values.amount);

  // Category (shadcn Select).
  await selectOption(page, 'recurring-category', values.category);

  // Cycle (shadcn Select).
  await selectOption(page, 'recurring-cycle', values.cycle);

  // Booking day type (optional; shadcn Select).
  if (values.bookingDayType) {
    await selectOption(page, 'recurring-booking-day-type', values.bookingDayType);
  }

  // Submit.
  await page.getByTestId('recurring-submit').click();
}

/**
 * Wait for generation to complete:
 * – The `recurring-progress` wrapper disappears (generating=false), AND
 * – The `recurring-gen-result` message is shown.
 *
 * Times out after `timeoutMs` ms.
 */
async function waitForGenerationDone(page: Page, timeoutMs = 30_000): Promise<void> {
  await expect(page.getByTestId('recurring-progress')).not.toBeVisible({ timeout: timeoutMs });
  await expect(page.getByTestId('recurring-gen-result')).toBeVisible({ timeout: 5_000 });
}

/**
 * Seed IndexedDB with synthetic transactions directly via page.evaluate().
 *
 * Must be called after page.goto() so the correct origin is active.
 * Uses the raw IndexedDB API to avoid a Dexie dependency in the test runner.
 * Database name "PaymentsDatabase" matches src/infrastructure/database.ts.
 */
async function seedTransactions(page: Page, count: number): Promise<void> {
  await page.evaluate(async (rowCount: number) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('PaymentsDatabase');
      req.onerror = () => reject(new Error('Failed to open PaymentsDatabase'));
      req.onsuccess = () => {
        const db = req.result;
        const clearTx = db.transaction('transactions', 'readwrite');
        clearTx.objectStore('transactions').clear();
        clearTx.oncomplete = () => {
          const writeTx = db.transaction('transactions', 'readwrite');
          const store = writeTx.objectStore('transactions');
          const CATEGORIES = ['Miete', 'Gehalt', 'Lebensmittel'];
          const SOURCES: string[] = ['recurring', 'episode', 'scatter', 'manual'];
          for (let i = 0; i < rowCount; i++) {
            const mm = String(Math.floor((i / 28) % 12) + 1).padStart(2, '0');
            const dd = String((i % 28) + 1).padStart(2, '0');
            const year = 2024 + Math.floor(i / (28 * 12));
            store.add({
              id: `seed-${String(i).padStart(6, '0')}`,
              date: `${year}-${mm}-${dd}`,
              time: '12:00',
              amount: i % 3 === 0 ? 2000 : -(50 + (i % 100)),
              purpose: `Seeded Transaktion ${i}`,
              counterparty: `Partner ${i % 200}`,
              category: CATEGORIES[i % CATEGORIES.length],
              source: SOURCES[i % SOURCES.length],
            });
          }
          writeTx.oncomplete = () => resolve();
          writeTx.onerror = () => reject(new Error('Write transaction failed'));
        };
        clearTx.onerror = () => reject(new Error('Clear transaction failed'));
      };
    });
  }, count);
}

/**
 * Parse a formatted KPI amount string (German locale) to a float.
 *
 * Handles patterns like "€ 1.234,56", "−€ 450,00", "0,00 €".
 * Returns 0 if the string cannot be parsed.
 */
function parseKpiAmount(raw: string): number {
  // Strip currency symbol, whitespace, and the minus sign (handled via negative float below).
  const normalised = raw
    .replace(/[€\s\u00a0]/g, '') // strip €, space, non-breaking space
    .replace(/\./g, '') // remove thousands separators (dots)
    .replace(',', '.') // decimal comma → dot
    .replace('−', '-'); // Unicode minus → hyphen-minus
  const value = parseFloat(normalised);
  return isNaN(value) ? 0 : value;
}

// ---------------------------------------------------------------------------
// 1 · TC-10 – Recurring End-to-End (P4b-10 / CLA-62)
// ---------------------------------------------------------------------------
test.describe('TC-10 · Recurring End-to-End (P4b-10 / CLA-62)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    // 3-month window: Jan–Mar 2025.  A rule on day 15 yields exactly 3 occurrences.
    await setGlobalConfig(page, { startDate: '2025-01-01', endDate: '2025-03-31' });
    await goToTab(page, 'dauerauftraege');
  });

  test('Daueraufträge tab shows the recurring generator form fields', async ({ page }) => {
    await expect(page.getByTestId('recurring-name')).toBeVisible();
    await expect(page.getByTestId('recurring-counterparty')).toBeVisible();
    await expect(page.getByTestId('recurring-purpose')).toBeVisible();
    await expect(page.getByTestId('recurring-transaction-type')).toBeVisible();
    await expect(page.getByTestId('recurring-category')).toBeVisible();
    await expect(page.getByTestId('recurring-cycle')).toBeVisible();
    await expect(page.getByTestId('recurring-day-of-month')).toBeVisible();
    await expect(page.getByTestId('recurring-submit')).toBeVisible();
  });

  test('empty rule list shows the empty-state placeholder', async ({ page }) => {
    await expect(page.getByTestId('recurring-empty')).toBeVisible();
    await expect(page.getByTestId('recurring-rule-list')).not.toBeVisible();
  });

  test('adding a recurring rule appends it to the rule list', async ({ page }) => {
    await fillRecurringForm(page, {
      name: 'Monatsmiete',
      counterparty: 'Vermieterin Mustermann',
      purpose: 'Miete 2025',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '850.00',
      cycle: 'Monatlich',
      dayOfMonth: '15',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    // Empty state gone; rule list visible with exactly 1 item.
    await expect(page.getByTestId('recurring-empty')).not.toBeVisible();
    await expect(page.getByTestId('recurring-rule-list')).toBeVisible();
    await expect(page.locator('[data-testid^="recurring-rule-item-"]')).toHaveCount(1);
    await expect(page.getByTestId('recurring-rule-list')).toContainText('Monatsmiete');
  });

  test('generate button is disabled when no rules exist', async ({ page }) => {
    await expect(page.getByTestId('recurring-generate-btn')).toBeDisabled();
  });

  test('generate button is enabled after adding a rule', async ({ page }) => {
    await fillRecurringForm(page, {
      name: 'Regel für Enable-Test',
      counterparty: 'Partner',
      purpose: 'Enable Test',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '100.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
    });
    await expect(page.getByTestId('recurring-generate-btn')).toBeEnabled();
  });

  test('generating recurring transactions (TC-10): rule → generate → rows in table', async ({
    page,
  }) => {
    // Step 1 – Create rule: €500 expense monthly on the 1st.
    await fillRecurringForm(page, {
      name: 'TC-10 Dauerauftrag',
      counterparty: 'TC10 Empfaenger',
      purpose: 'Dauerauftrag E2E Test',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '500.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await expect(page.locator('[data-testid^="recurring-rule-item-"]')).toHaveCount(1);

    // Step 2 – Trigger generation.
    await page.getByTestId('recurring-generate-btn').click();

    // Step 3 – Progress indicator is shown while generating.
    await expect(page.getByTestId('recurring-progress')).toBeVisible();

    // Step 4 – Wait for generation to complete (progress disappears; result shown).
    await waitForGenerationDone(page);

    // Step 5 – Navigate to Transaktionen tab.
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });

    // Step 6 – Verify at least one transaction row exists.
    const rows = page.getByTestId('transaction-table-row');
    await expect(rows).not.toHaveCount(0, { timeout: 10_000 });

    // Step 7 – Verify generated row matches the rule data.
    await expect(page.getByTestId('transaction-table')).toContainText('TC10 Empfaenger');
    await expect(page.getByTestId('transaction-table')).toContainText('Dauerauftrag E2E Test');

    // Step 8 – Source column shows the localised label for recurring ("Dauerauftrag").
    await expect(rows.first()).toContainText(/dauerauftrag/i);
  });

  test('generated transactions fall within the configured date range', async ({ page }) => {
    // Monthly income on the 15th → Jan 15, Feb 15, Mar 15 (exactly 3 rows).
    await fillRecurringForm(page, {
      name: 'Datumsprüfung',
      counterparty: 'Datum Empfaenger',
      purpose: 'Datum Test',
      category: 'Gehalt',
      transactionType: 'Einnahme',
      amount: '1000.00',
      cycle: 'Monatlich',
      dayOfMonth: '15',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });

    // Exactly 3 recurring rows.
    await expect(page.getByTestId('transaction-table-row')).toHaveCount(3, { timeout: 10_000 });

    // All three dates are within 2025.
    const tableText = await page.getByTestId('transaction-table').innerText();
    expect(tableText).toContain('2025-01-15');
    expect(tableText).toContain('2025-02-15');
    expect(tableText).toContain('2025-03-15');
  });

  test('rule list shows edit and delete buttons for each rule', async ({ page }) => {
    await fillRecurringForm(page, {
      name: 'Regel A',
      counterparty: 'X',
      purpose: 'Y',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '10.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
    });

    const ruleItem = page.locator('[data-testid^="recurring-rule-item-"]').first();
    await expect(ruleItem).toBeVisible();

    // Each rule card must expose edit and delete controls.
    const ruleId = (await ruleItem.getAttribute('data-testid'))!.replace(
      'recurring-rule-item-',
      '',
    );
    await expect(page.getByTestId(`recurring-edit-${ruleId}`)).toBeVisible();
    await expect(page.getByTestId(`recurring-delete-${ruleId}`)).toBeVisible();
  });

  test('deleting a rule removes it from the list and opens ConfirmModal', async ({ page }) => {
    await fillRecurringForm(page, {
      name: 'Zu löschende Regel',
      counterparty: 'Partner',
      purpose: 'Löschen',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '50.00',
      cycle: 'Monatlich',
      dayOfMonth: '5',
    });

    const ruleItem = page.locator('[data-testid^="recurring-rule-item-"]').first();
    const ruleId = (await ruleItem.getAttribute('data-testid'))!.replace(
      'recurring-rule-item-',
      '',
    );

    // Click the delete button.
    await page.getByTestId(`recurring-delete-${ruleId}`).click();
    // ConfirmModal should open.
    await expect(page.getByTestId('confirm-modal')).toBeVisible();

    // Confirm the deletion.
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Rule list should be empty again.
    await expect(page.getByTestId('recurring-empty')).toBeVisible();
  });

  test('@safari recurring End-to-End works in WebKit', async ({ page }) => {
    await fillRecurringForm(page, {
      name: 'Safari Dauerauftrag',
      counterparty: 'Safari Empfaenger',
      purpose: 'Safari Test',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '300.00',
      cycle: 'Monatlich',
      dayOfMonth: '5',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 15_000 });
    await expect(page.getByTestId('transaction-table-row')).not.toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · Virtual Scrolling – TransactionTable 5 000+ rows (P4b-05 / CLA-62)
// ---------------------------------------------------------------------------
test.describe('Virtual Scrolling (P4b-05 / CLA-62)', () => {
  // Generous timeout: seeding 5 000 rows + rendering takes longer than default.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    // Seed 5 001 transactions directly into IndexedDB.
    await seedTransactions(page, 5_001);
  });

  test('TransactionTable renders 5 000+ rows without freezing', async ({ page }) => {
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 30_000 });

    // Empty-state must not be visible when rows exist.
    await expect(page.getByTestId('transaction-table-empty')).not.toBeVisible();

    // Virtual list: at least the first visible row must be rendered.
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('scrolling to the bottom of 5 000+ rows completes without timeout', async ({ page }) => {
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 30_000 });
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 15_000,
    });

    // Scroll the table in increments to simulate real user behaviour.
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 5_000);
      await page.waitForTimeout(100);
    }

    // After scrolling, at least one row must still be rendered (virtual recycling works).
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('scrolling back to the top re-renders initial rows', async ({ page }) => {
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 30_000 });
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 15_000,
    });

    // Scroll to bottom.
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 5_000);
      await page.waitForTimeout(50);
    }

    // Scroll back to top.
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -5_000);
      await page.waitForTimeout(50);
    }

    // Top rows must be re-rendered.
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('@safari virtual scroll works in WebKit without timeout', async ({ page }) => {
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 30_000 });
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 15_000,
    });

    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 5_000);
      await page.waitForTimeout(150);
    }

    // Table must still be responsive and not frozen.
    await expect(page.getByTestId('transaction-table')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3 · KPI Correctness (P4b-07 / CLA-62)
// ---------------------------------------------------------------------------
test.describe('KPI Correctness (P4b-07 / CLA-62)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    // Fixed 3-month window: Jan–Mar 2025.
    await setGlobalConfig(page, { startDate: '2025-01-01', endDate: '2025-03-31' });
    await goToTab(page, 'dauerauftraege');
  });

  test('KPI expense sum matches generated expense transactions (< 0.01 € deviation)', async ({
    page,
  }) => {
    // €150.00 expense on the 1st of each month → 3 × −150.00 = −450.00.
    await fillRecurringForm(page, {
      name: 'KPI Ausgabenregel',
      counterparty: 'KPI Vermieter',
      purpose: 'KPI Miete',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '150.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });

    const kpiExpenseText = await page.getByTestId('kpi-expense').innerText();
    const kpiExpense = parseKpiAmount(kpiExpenseText);

    // Expected: 3 × 150.00 = 450.00 (KpiHeader zeigt Math.abs der Ausgaben).
    expect(
      Math.abs(kpiExpense - 450.0),
      `KPI expense: got ${kpiExpense}, expected 450.00`,
    ).toBeLessThan(0.01);
  });

  test('KPI income sum matches generated income transactions (< 0.01 € deviation)', async ({
    page,
  }) => {
    // €2 500.00 income on the 25th of each month → 3 × 2 500.00 = 7 500.00.
    await fillRecurringForm(page, {
      name: 'KPI Einkommensregel',
      counterparty: 'KPI Arbeitgeber GmbH',
      purpose: 'Gehalt',
      category: 'Gehalt',
      transactionType: 'Einnahme',
      amount: '2500.00',
      cycle: 'Monatlich',
      dayOfMonth: '25',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });

    const kpiIncomeText = await page.getByTestId('kpi-income').innerText();
    const kpiIncome = parseKpiAmount(kpiIncomeText);

    // Expected: 3 × 2 500.00 = 7 500.00.
    expect(
      Math.abs(kpiIncome - 7_500.0),
      `KPI income: got ${kpiIncome}, expected 7500.00`,
    ).toBeLessThan(0.01);
  });

  test('KPI balance equals income minus expenses (< 0.01 € deviation)', async ({ page }) => {
    // Expense: €400 / month → −1 200.00 over 3 months.
    await fillRecurringForm(page, {
      name: 'KPI Saldo Ausgabe',
      counterparty: 'KPI Vermieter',
      purpose: 'Miete',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '400.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    // Income: €1 000 / month → +3 000.00 over 3 months.
    await fillRecurringForm(page, {
      name: 'KPI Saldo Einkommen',
      counterparty: 'KPI AG',
      purpose: 'Gehalt',
      category: 'Gehalt',
      transactionType: 'Einnahme',
      amount: '1000.00',
      cycle: 'Monatlich',
      dayOfMonth: '15',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });

    const income = parseKpiAmount(await page.getByTestId('kpi-income').innerText());
    const expense = parseKpiAmount(await page.getByTestId('kpi-expense').innerText());
    const balance = parseKpiAmount(await page.getByTestId('kpi-balance').innerText());

    // Expected:  income=3000, expense=1200 (absolut), balance=+1800.
    expect(Math.abs(income - 3_000.0), `income: got ${income}`).toBeLessThan(0.01);
    expect(Math.abs(expense - 1_200.0), `expense: got ${expense}`).toBeLessThan(0.01);
    expect(Math.abs(balance - 1_800.0), `balance: got ${balance}`).toBeLessThan(0.01);
  });

  test('KPI shows zeros when no transactions exist', async ({ page }) => {
    // Navigate directly to Transaktionen without generating anything.
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });

    const income = parseKpiAmount(await page.getByTestId('kpi-income').innerText());
    const expense = parseKpiAmount(await page.getByTestId('kpi-expense').innerText());
    const balance = parseKpiAmount(await page.getByTestId('kpi-balance').innerText());

    expect(income).toBe(0);
    expect(expense).toBe(0);
    expect(balance).toBe(0);
  });

  test('@safari KPI header renders and is numerically correct in WebKit', async ({ page }) => {
    await fillRecurringForm(page, {
      name: 'Safari KPI',
      counterparty: 'Safari AG',
      purpose: 'Safari Gehalt',
      category: 'Gehalt',
      transactionType: 'Einnahme',
      amount: '500.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 15_000 });

    await expect(page.getByTestId('kpi-income')).toBeVisible();
    await expect(page.getByTestId('kpi-expense')).toBeVisible();
    await expect(page.getByTestId('kpi-balance')).toBeVisible();

    // 3 × €500 = €1 500 income.
    const kpiIncome = parseKpiAmount(await page.getByTestId('kpi-income').innerText());
    expect(Math.abs(kpiIncome - 1_500.0)).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// 4 · Edit / Delete Flow (P4b-08 / CLA-62)
// ---------------------------------------------------------------------------
test.describe('Edit/Delete Flow (P4b-08 / CLA-62)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    // Seed 5 small transactions to test edit/delete without requiring generation.
    await seedTransactions(page, 5);
    await goToTab(page, 'transaktionen');
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10_000 });
    await expect(page.getByTestId('transaction-table-row').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('clicking edit on a row opens the edit modal', async ({ page }) => {
    await page
      .getByTestId('transaction-table-row')
      .first()
      .getByTestId('transaction-edit-btn')
      .click();
    await expect(page.getByTestId('transaction-edit-modal')).toBeVisible();
  });

  test('edit modal contains editable purpose and amount fields with action buttons', async ({
    page,
  }) => {
    await page
      .getByTestId('transaction-table-row')
      .first()
      .getByTestId('transaction-edit-btn')
      .click();

    await expect(page.getByTestId('transaction-edit-modal')).toBeVisible();
    await expect(page.getByTestId('transaction-edit-modal-purpose')).toBeVisible();
    await expect(page.getByTestId('transaction-edit-modal-amount')).toBeVisible();
    await expect(page.getByTestId('transaction-edit-modal-save-btn')).toBeVisible();
    await expect(page.getByTestId('transaction-edit-modal-cancel-btn')).toBeVisible();
  });

  test('saving an edit updates the purpose visible in the TransactionTable', async ({ page }) => {
    await page
      .getByTestId('transaction-table-row')
      .first()
      .getByTestId('transaction-edit-btn')
      .click();

    await expect(page.getByTestId('transaction-edit-modal')).toBeVisible();

    const newPurpose = `Bearbeitet-${Date.now()}`;
    await page.getByTestId('transaction-edit-modal-purpose').fill(newPurpose);
    await page.getByTestId('transaction-edit-modal-save-btn').click();

    // Modal must close.
    await expect(page.getByTestId('transaction-edit-modal')).not.toBeVisible();

    // Updated purpose must appear in the table.
    await expect(page.getByTestId('transaction-table')).toContainText(newPurpose);
  });

  test('cancelling the edit modal leaves the transaction unchanged', async ({ page }) => {
    const firstRow = page.getByTestId('transaction-table-row').first();
    const originalText = await firstRow.innerText();

    await firstRow.getByTestId('transaction-edit-btn').click();
    await expect(page.getByTestId('transaction-edit-modal')).toBeVisible();

    await page.getByTestId('transaction-edit-modal-purpose').fill('CANCELLED_EDIT_SENTINEL');
    await page.getByTestId('transaction-edit-modal-cancel-btn').click();

    await expect(page.getByTestId('transaction-edit-modal')).not.toBeVisible();
    await expect(page.getByTestId('transaction-table-row').first()).not.toContainText(
      'CANCELLED_EDIT_SENTINEL',
    );
    // Original text must still be present (at least the first token).
    const firstToken = originalText.split(/\s+/)[0];
    if (firstToken) {
      await expect(page.getByTestId('transaction-table-row').first()).toContainText(firstToken);
    }
  });

  test('pressing Escape closes the edit modal without saving', async ({ page }) => {
    await page
      .getByTestId('transaction-table-row')
      .first()
      .getByTestId('transaction-edit-btn')
      .click();

    await expect(page.getByTestId('transaction-edit-modal')).toBeVisible();
    await page.getByTestId('transaction-edit-modal-purpose').fill('ESC_CANCEL_SENTINEL');
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('transaction-edit-modal')).not.toBeVisible();
    await expect(page.getByTestId('transaction-table')).not.toContainText('ESC_CANCEL_SENTINEL');
  });

  test('clicking delete on a row opens the ConfirmModal', async ({ page }) => {
    await page
      .getByTestId('transaction-table-row')
      .first()
      .getByTestId('transaction-delete-btn')
      .click();

    await expect(page.getByTestId('confirm-modal')).toBeVisible();
  });

  test('confirming deletion removes the transaction from the table', async ({ page }) => {
    const rows = page.getByTestId('transaction-table-row');
    const countBefore = await rows.count();

    await rows.first().getByTestId('transaction-delete-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Row count decreases by 1.
    await expect(rows).toHaveCount(countBefore - 1, { timeout: 5_000 });
  });

  test('cancelling deletion keeps the transaction in the table', async ({ page }) => {
    const rows = page.getByTestId('transaction-table-row');
    const countBefore = await rows.count();

    await rows.first().getByTestId('transaction-delete-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-cancel').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    // Row count must be unchanged.
    await expect(rows).toHaveCount(countBefore);
  });

  test('pressing Escape in the ConfirmModal cancels deletion', async ({ page }) => {
    const rows = page.getByTestId('transaction-table-row');
    const countBefore = await rows.count();

    await rows.first().getByTestId('transaction-delete-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    await expect(rows).toHaveCount(countBefore);
  });

  test('two sequential deletions reduce row count by 2', async ({ page }) => {
    const rows = page.getByTestId('transaction-table-row');
    const countBefore = await rows.count();

    for (let i = 0; i < 2; i++) {
      await rows.first().getByTestId('transaction-delete-btn').click();
      await expect(page.getByTestId('confirm-modal')).toBeVisible();
      await page.getByTestId('confirm-modal-confirm').click();
      await expect(page.getByTestId('confirm-modal')).not.toBeVisible();
    }

    await expect(rows).toHaveCount(countBefore - 2, { timeout: 5_000 });
  });

  test('@safari edit and delete work correctly in WebKit', async ({ page }) => {
    // Edit: change purpose and verify update.
    await page
      .getByTestId('transaction-table-row')
      .first()
      .getByTestId('transaction-edit-btn')
      .click();
    await expect(page.getByTestId('transaction-edit-modal')).toBeVisible();
    const safariPurpose = `Safari-Edit-${Date.now()}`;
    await page.getByTestId('transaction-edit-modal-purpose').fill(safariPurpose);
    await page.getByTestId('transaction-edit-modal-save-btn').click();
    await expect(page.getByTestId('transaction-edit-modal')).not.toBeVisible();
    await expect(page.getByTestId('transaction-table')).toContainText(safariPurpose);

    // Delete: confirm and verify row count drops.
    const rows = page.getByTestId('transaction-table-row');
    const countBefore = await rows.count();
    await rows.first().getByTestId('transaction-delete-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();
    await expect(rows).toHaveCount(countBefore - 1, { timeout: 5_000 });
  });
});
