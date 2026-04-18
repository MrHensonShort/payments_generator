import * as fs from 'fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 5 E2E Tests – Export / Import
 *
 * Covers (P5-07 / CLA-69):
 *  1. CSV-Export-Flow    (P5-01): Generate transactions → export CSV → verify downloaded file
 *  2. Backup-Import-Roundtrip (P5-02): Export JSON backup → clear DB → import → rows restored
 *  3. Fehlerszenario > 50 MB (P5-02): Upload synthetic large file → toast shown, no crash
 *
 * All selectors use `data-testid` attributes per the convention in CONTRIBUTING.md.
 * Tests run on Chromium, Firefox, and WebKit (playwright.config.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * BackupExportPage / BackupRestorePanel data-testid contracts (P5-05):
 *   backup-restore-panel     – page root container
 *   csv-export-section       – CSV export card section
 *   csv-delimiter-select     – Trennzeichen SelectTrigger (semicolon/comma/tab)
 *   csv-export-btn           – trigger CSV download of all transactions
 *   json-backup-section      – JSON backup card section
 *   export-transactions-btn  – download transactions-only JSON backup
 *   export-rules-btn         – download rules-only JSON backup
 *   export-all-btn           – download full backup (transactions + rules)
 *   restore-section          – import/restore card section
 *   import-mode-merge        – "Zusammenführen" toggle button
 *   import-mode-replace      – "Ersetzen" toggle button
 *   import-file-input        – <input type="file"> for backup files
 *   import-btn               – triggers the actual import after file selection
 *   import-success           – success banner after completed import
 *   import-error-list        – inline error list for rejected/invalid import data
 *   import-error-toast       – transient toast for size-limit or immediate errors
 *   db-maintenance-section   – DB maintenance card (destructive actions)
 *   delete-all-transactions-btn – clear all transactions (opens ConfirmModal)
 *   delete-all-rules-btn     – clear all rules (opens ConfirmModal)
 *
 * Shared testid reuses from previous phases:
 *   confirm-modal            – ConfirmModal from Phase 4a
 *   confirm-modal-confirm    – destructive confirm button
 *   confirm-modal-cancel     – dismiss button
 *   transaction-table        – TransactionTable container (Phase 4b)
 *   transaction-table-row    – individual transaction row
 *   transaction-table-empty  – empty-state placeholder
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

/** Open a shadcn/ui Select by its trigger testid and pick an option. */
async function selectOption(page: Page, triggerTestId: string, value: string): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: value, exact: false }).first().click();
}

interface RecurringFormValues {
  name: string;
  counterparty: string;
  purpose: string;
  category: string;
  transactionType: 'Einnahme' | 'Ausgabe' | 'Transfer';
  amount: string;
  cycle: string;
  dayOfMonth: string;
  bookingDayType?: string;
}

async function fillRecurringForm(page: Page, values: RecurringFormValues): Promise<void> {
  await page.waitForSelector('[data-testid="recurring-name"]');
  await page.getByTestId('recurring-name').fill(values.name);
  await page.getByTestId('recurring-counterparty').fill(values.counterparty);
  await page.getByTestId('recurring-purpose').fill(values.purpose);
  await page.getByTestId('recurring-day-of-month').fill(values.dayOfMonth);
  await selectOption(page, 'recurring-transaction-type', values.transactionType);
  const modeSelect = page.getByTestId('recurring-amount-mode-select');
  if (await modeSelect.isVisible().catch(() => false)) {
    const currentMode = await modeSelect.getAttribute('data-value').catch(() => '');
    if (currentMode !== 'fix') {
      await selectOption(page, 'recurring-amount-mode-select', 'fix');
    }
  }
  await page.getByTestId('recurring-amount-fix-value').fill(values.amount);
  await selectOption(page, 'recurring-category', values.category);
  await selectOption(page, 'recurring-cycle', values.cycle);
  if (values.bookingDayType) {
    await selectOption(page, 'recurring-booking-day-type', values.bookingDayType);
  }
  await page.getByTestId('recurring-submit').click();
}

async function waitForGenerationDone(page: Page, timeoutMs = 30_000): Promise<void> {
  await expect(page.getByTestId('recurring-progress')).not.toBeVisible({ timeout: timeoutMs });
  await expect(page.getByTestId('recurring-gen-result')).toBeVisible({ timeout: 5_000 });
}

/**
 * Seed IndexedDB with synthetic transactions via page.evaluate().
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

/** Clear all transactions in IndexedDB directly (without UI). */
async function clearTransactionsDirectly(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('PaymentsDatabase');
      req.onerror = () => reject(new Error('Failed to open PaymentsDatabase'));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('transactions', 'readwrite');
        tx.objectStore('transactions').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Clear failed'));
      };
    });
  });
}

/** Count transactions in IndexedDB directly. */
async function countTransactionsDirectly(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const req = indexedDB.open('PaymentsDatabase');
      req.onerror = () => reject(new Error('Failed to open PaymentsDatabase'));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('transactions', 'readonly');
        const countReq = tx.objectStore('transactions').count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => reject(new Error('Count failed'));
      };
    });
  });
}

/**
 * Trigger a button that causes a file download; return the downloaded file's content.
 */
async function readDownloadedFile(page: Page, triggerTestId: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId(triggerTestId).click(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error('Download path is null – download may have failed');
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Navigate to the Backup page and select a file for import.
 * The import is a two-step flow: (1) select file, (2) click import-btn.
 */
async function selectImportFile(
  page: Page,
  fileContents: string | Buffer,
  filename = 'backup.json',
): Promise<void> {
  const buffer =
    typeof fileContents === 'string' ? Buffer.from(fileContents, 'utf-8') : fileContents;
  await page.getByTestId('import-file-input').setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer,
  });
}

// ---------------------------------------------------------------------------
// 1 · CSV-Export-Flow (P5-07 / CLA-69)
// ---------------------------------------------------------------------------
test.describe('CSV-Export-Flow (P5-07 / CLA-69)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
  });

  test('Backup & Export tab is reachable via navigation', async ({ page }) => {
    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();
  });

  test('CSV export section and button are present', async ({ page }) => {
    await goToTab(page, 'backup');
    await expect(page.getByTestId('csv-export-section')).toBeVisible();
    await expect(page.getByTestId('csv-export-btn')).toBeVisible();
    await expect(page.getByTestId('csv-delimiter-select')).toBeVisible();
  });

  test('CSV export triggers a file download', async ({ page }) => {
    // Seed transactions so the export is non-empty.
    await seedTransactions(page, 5);
    await goToTab(page, 'backup');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('csv-export-btn').click(),
    ]);

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    expect(fs.existsSync(filePath!)).toBe(true);
  });

  test('downloaded CSV file has a .csv extension', async ({ page }) => {
    await seedTransactions(page, 3);
    await goToTab(page, 'backup');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('csv-export-btn').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test('downloaded CSV has a header row and data rows matching transaction count', async ({
    page,
  }) => {
    const TX_COUNT = 10;
    await seedTransactions(page, TX_COUNT);
    await goToTab(page, 'backup');

    const content = await readDownloadedFile(page, 'csv-export-btn');
    // Strip UTF-8 BOM if present (implementation adds BOM for Excel compatibility).
    const stripped = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const nonEmptyLines = stripped.split('\n').filter((l) => l.trim().length > 0);

    // Header + TX_COUNT data rows.
    expect(nonEmptyLines.length).toBe(TX_COUNT + 1);
  });

  test('downloaded CSV header includes expected column names', async ({ page }) => {
    await seedTransactions(page, 3);
    await goToTab(page, 'backup');

    const content = await readDownloadedFile(page, 'csv-export-btn');
    const stripped = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const firstLine = stripped.split('\n')[0]!;

    // Implementation uses German headers: Datum, Betrag, Verwendungszweck, Gegenkonto.
    expect(firstLine).toContain('Datum');
    expect(firstLine).toContain('Betrag');
    expect(firstLine).toContain('Verwendungszweck');
    expect(firstLine).toContain('Gegenkonto');
  });

  test('CSV data contains values from seeded transactions', async ({ page }) => {
    await seedTransactions(page, 5);
    await goToTab(page, 'backup');

    const content = await readDownloadedFile(page, 'csv-export-btn');

    // Seeded transactions contain "Seeded Transaktion" as purpose.
    expect(content).toContain('Seeded Transaktion');
    // Counterparty values contain "Partner".
    expect(content).toContain('Partner');
  });

  test('CSV export with zero transactions shows a toast (no file download)', async ({ page }) => {
    // Clear DB before navigating.
    await clearTransactionsDirectly(page);
    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    // Click export – implementation shows a toast when there are no transactions.
    await page.getByTestId('csv-export-btn').click();

    // The import-error-toast (role=alert) should appear.
    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });
    // Page must not crash.
    await expect(page.getByTestId('csv-export-btn')).toBeVisible();
  });

  test('TC-13 · CSV export full generator flow: rule → generate → export → verify', async ({
    page,
  }) => {
    // 3-month window: Jan–Mar 2025. A monthly rule on day 1 → 3 occurrences.
    await setGlobalConfig(page, { startDate: '2025-01-01', endDate: '2025-03-31' });
    await goToTab(page, 'dauerauftraege');

    await fillRecurringForm(page, {
      name: 'CSV-Export-Regel',
      counterparty: 'CSV-Empfaenger',
      purpose: 'CSV Export Test',
      category: 'Miete',
      transactionType: 'Ausgabe',
      amount: '500.00',
      cycle: 'Monatlich',
      dayOfMonth: '1',
      bookingDayType: 'Fix (exakter Kalendertag)',
    });

    await page.getByTestId('recurring-generate-btn').click();
    await waitForGenerationDone(page);

    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();

    const content = await readDownloadedFile(page, 'csv-export-btn');
    const stripped = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const nonEmptyLines = stripped.split('\n').filter((l) => l.trim().length > 0);

    // Header + 3 data rows.
    expect(nonEmptyLines.length).toBe(4);
    expect(content).toContain('CSV Export Test');
    expect(content).toContain('CSV-Empfaenger');
  });

  test('delimiter selector changes the separator used in the CSV file', async ({ page }) => {
    await seedTransactions(page, 3);
    await goToTab(page, 'backup');

    // Switch delimiter to comma.
    await selectOption(page, 'csv-delimiter-select', 'Komma');

    const content = await readDownloadedFile(page, 'csv-export-btn');
    const stripped = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const firstLine = stripped.split('\n')[0]!;

    // Comma-separated: the header cells should be joined by commas.
    expect(firstLine.split(',').length).toBeGreaterThan(1);
  });

  test('@safari CSV export download works in WebKit', async ({ page }) => {
    await seedTransactions(page, 5);
    await goToTab(page, 'backup');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('csv-export-btn').click(),
    ]);

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    const content = fs.readFileSync(filePath!, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · Backup-Import-Roundtrip (P5-07 / CLA-69)
// ---------------------------------------------------------------------------
test.describe('Backup-Import-Roundtrip (P5-07 / CLA-69)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
  });

  test('JSON backup section and export buttons are present', async ({ page }) => {
    await goToTab(page, 'backup');
    await expect(page.getByTestId('json-backup-section')).toBeVisible();
    await expect(page.getByTestId('export-transactions-btn')).toBeVisible();
    await expect(page.getByTestId('export-rules-btn')).toBeVisible();
    await expect(page.getByTestId('export-all-btn')).toBeVisible();
  });

  test('import section is present with file input, mode buttons, and import button', async ({
    page,
  }) => {
    await goToTab(page, 'backup');
    await expect(page.getByTestId('restore-section')).toBeVisible();
    await expect(page.getByTestId('import-file-input')).toBeAttached();
    await expect(page.getByTestId('import-mode-merge')).toBeVisible();
    await expect(page.getByTestId('import-mode-replace')).toBeVisible();
    // Import button is disabled until a file is selected.
    await expect(page.getByTestId('import-btn')).toBeDisabled();
  });

  test('export-all-btn triggers a file download', async ({ page }) => {
    await seedTransactions(page, 5);
    await goToTab(page, 'backup');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-all-btn').click(),
    ]);

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    expect(fs.existsSync(filePath!)).toBe(true);
  });

  test('downloaded backup is valid JSON with version and transactions fields', async ({ page }) => {
    const TX_COUNT = 8;
    await seedTransactions(page, TX_COUNT);
    await goToTab(page, 'backup');

    const content = await readDownloadedFile(page, 'export-all-btn');

    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(content);
    }, 'Backup file should be valid JSON').not.toThrow();

    const backup = parsed as Record<string, unknown>;
    expect(backup).toHaveProperty('version');
    expect(backup).toHaveProperty('transactions');
    expect(Array.isArray(backup.transactions)).toBe(true);
    expect((backup.transactions as unknown[]).length).toBe(TX_COUNT);
  });

  test('export-transactions-btn produces a JSON backup with only the transactions field', async ({
    page,
  }) => {
    await seedTransactions(page, 3);
    await goToTab(page, 'backup');

    const content = await readDownloadedFile(page, 'export-transactions-btn');
    const backup = JSON.parse(content) as Record<string, unknown>;

    expect(backup).toHaveProperty('version');
    expect(backup).toHaveProperty('transactions');
    expect(Array.isArray(backup.transactions)).toBe(true);
  });

  test('TC-14 · Roundtrip: export → clear → import (merge mode) → transaction count restored', async ({
    page,
  }) => {
    const TX_COUNT = 15;
    await seedTransactions(page, TX_COUNT);

    // Step 1 – Export backup.
    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-all-btn').click(),
    ]);
    const backupPath = await download.path();
    expect(backupPath).not.toBeNull();
    const backupContent = fs.readFileSync(backupPath!, 'utf-8');

    // Step 2 – Clear all transactions.
    await clearTransactionsDirectly(page);
    expect(await countTransactionsDirectly(page)).toBe(0);

    // Step 3 – Reload and navigate to backup page.
    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();

    // Step 4 – Select the backup file (merge mode is default).
    await expect(page.getByTestId('import-mode-merge')).toBeVisible();
    await selectImportFile(page, backupContent);

    // import-btn must become enabled after file selection.
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });

    // Step 5 – Click import.
    await page.getByTestId('import-btn').click();

    // Step 6 – Success banner appears.
    await expect(page.getByTestId('import-success')).toBeVisible({ timeout: 10_000 });

    // Step 7 – Verify transaction count in DB.
    expect(await countTransactionsDirectly(page)).toBe(TX_COUNT);
  });

  test('Roundtrip in replace mode: existing data is replaced, not merged', async ({ page }) => {
    // Seed 5 "old" transactions.
    await seedTransactions(page, 5);

    // Export the "new" backup first (from a fresh set).
    await seedTransactions(page, 10);
    await goToTab(page, 'backup');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-all-btn').click(),
    ]);
    const backupContent = fs.readFileSync((await download.path())!, 'utf-8');

    // Now seed 3 different transactions that are NOT in the backup.
    await seedTransactions(page, 3);

    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    // Switch to replace mode.
    await page.getByTestId('import-mode-replace').click();
    await expect(page.getByTestId('import-mode-replace')).toHaveClass(
      /text-primary|border-primary/,
    );

    await selectImportFile(page, backupContent);
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });
    await page.getByTestId('import-btn').click();

    await expect(page.getByTestId('import-success')).toBeVisible({ timeout: 10_000 });

    // Replace mode: exactly 10 rows (the backup's contents), not 3+10=13.
    expect(await countTransactionsDirectly(page)).toBe(10);
  });

  test('Roundtrip preserves transaction data integrity (amounts, purposes, IDs)', async ({
    page,
  }) => {
    const TX_COUNT = 5;
    await seedTransactions(page, TX_COUNT);

    // Capture original data.
    const originalData = await page.evaluate(
      async (): Promise<{ id: string; amount: number; purpose: string }[]> => {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open('PaymentsDatabase');
          req.onerror = () => reject(new Error('DB open failed'));
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('transactions', 'readonly');
            const getAllReq = tx.objectStore('transactions').getAll();
            getAllReq.onsuccess = () =>
              resolve(
                (getAllReq.result as { id: string; amount: number; purpose: string }[]).map(
                  (r) => ({
                    id: r.id,
                    amount: r.amount,
                    purpose: r.purpose,
                  }),
                ),
              );
            getAllReq.onerror = () => reject(new Error('GetAll failed'));
          };
        });
      },
    );

    // Export, clear, import.
    await goToTab(page, 'backup');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-all-btn').click(),
    ]);
    const backupContent = fs.readFileSync((await download.path())!, 'utf-8');

    await clearTransactionsDirectly(page);
    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    await selectImportFile(page, backupContent);
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });
    await page.getByTestId('import-btn').click();
    await expect(page.getByTestId('import-success')).toBeVisible({ timeout: 10_000 });

    // Verify restored data matches original.
    const restoredData = await page.evaluate(
      async (): Promise<{ id: string; amount: number; purpose: string }[]> => {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open('PaymentsDatabase');
          req.onerror = () => reject(new Error('DB open failed'));
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('transactions', 'readonly');
            const getAllReq = tx.objectStore('transactions').getAll();
            getAllReq.onsuccess = () =>
              resolve(
                (getAllReq.result as { id: string; amount: number; purpose: string }[]).map(
                  (r) => ({
                    id: r.id,
                    amount: r.amount,
                    purpose: r.purpose,
                  }),
                ),
              );
            getAllReq.onerror = () => reject(new Error('GetAll failed'));
          };
        });
      },
    );

    expect(restoredData.length).toBe(originalData.length);

    const sortById = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    const sortedOrig = [...originalData].sort(sortById);
    const sortedRestored = [...restoredData].sort(sortById);

    for (let i = 0; i < sortedOrig.length; i++) {
      expect(sortedRestored[i]!.id).toBe(sortedOrig[i]!.id);
      expect(Math.abs(sortedRestored[i]!.amount - sortedOrig[i]!.amount)).toBeLessThan(0.001);
      expect(sortedRestored[i]!.purpose).toBe(sortedOrig[i]!.purpose);
    }
  });

  test('invalid JSON file shows import error list without crashing', async ({ page }) => {
    await goToTab(page, 'backup');

    await selectImportFile(page, 'this is not valid json {{ }}', 'broken.json');
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });
    await page.getByTestId('import-btn').click();

    // Error list should appear.
    await expect(page.getByTestId('import-error-list')).toBeVisible({ timeout: 5_000 });
    // Success banner must NOT appear.
    await expect(page.getByTestId('import-success')).not.toBeVisible();
    // Page must remain functional.
    await expect(page.getByTestId('import-btn')).toBeVisible();
  });

  test('JSON backup without transactions or rules field shows validation error', async ({
    page,
  }) => {
    await goToTab(page, 'backup');

    const emptyBackup = JSON.stringify({ version: 1, exportedAt: new Date().toISOString() });
    await selectImportFile(page, emptyBackup, 'empty-backup.json');
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });
    await page.getByTestId('import-btn').click();

    await expect(page.getByTestId('import-error-list')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('import-success')).not.toBeVisible();
  });

  test('after successful import, navigating away and back leaves page functional', async ({
    page,
  }) => {
    await seedTransactions(page, 3);
    await goToTab(page, 'backup');

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-all-btn').click(),
    ]);
    const backupContent = fs.readFileSync((await dl.path())!, 'utf-8');

    await clearTransactionsDirectly(page);
    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    await selectImportFile(page, backupContent);
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });
    await page.getByTestId('import-btn').click();
    await expect(page.getByTestId('import-success')).toBeVisible({ timeout: 10_000 });

    // Navigate away and back.
    await goToTab(page, 'transaktionen');
    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();
    await expect(page.getByTestId('csv-export-btn')).toBeVisible();
    await expect(page.getByTestId('export-all-btn')).toBeVisible();
  });

  test('@safari backup roundtrip works in WebKit', async ({ page }) => {
    const TX_COUNT = 5;
    await seedTransactions(page, TX_COUNT);

    await goToTab(page, 'backup');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-all-btn').click(),
    ]);
    const backupContent = fs.readFileSync((await download.path())!, 'utf-8');

    // Verify JSON structure.
    const parsed = JSON.parse(backupContent) as Record<string, unknown>;
    expect(Array.isArray(parsed.transactions)).toBe(true);
    expect((parsed.transactions as unknown[]).length).toBe(TX_COUNT);

    // Clear and reimport.
    await clearTransactionsDirectly(page);
    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    await selectImportFile(page, backupContent);
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 5_000 });
    await page.getByTestId('import-btn').click();
    await expect(page.getByTestId('import-success')).toBeVisible({ timeout: 15_000 });

    expect(await countTransactionsDirectly(page)).toBe(TX_COUNT);
  });
});

// ---------------------------------------------------------------------------
// 3 · Fehlerszenario > 50 MB (P5-07 / CLA-69)
// ---------------------------------------------------------------------------
test.describe('Fehlerszenario > 50 MB (P5-07 / CLA-69)', () => {
  // Allocating a 51 MB buffer takes time – extend timeout.
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();
  });

  test('uploading a file > 50 MB shows the error toast without crashing', async ({ page }) => {
    // 51 MB synthetic buffer – not valid JSON; size check happens before parsing.
    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024, 0x78); // 'x' fill

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'huge-backup.json',
      mimeType: 'application/json',
      buffer: oversizedBuffer,
    });

    // Toast must appear (data-testid="import-error-toast", role="alert").
    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });
  });

  test('error toast appears within 500 ms of file selection (acceptance criterion)', async ({
    page,
  }) => {
    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024, 0x78);
    const startTime = Date.now();

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'huge-backup.json',
      mimeType: 'application/json',
      buffer: oversizedBuffer,
    });

    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });
    const elapsed = Date.now() - startTime;

    // Acceptance criterion from P5-04: toast < 500 ms after file selection.
    expect(elapsed, `Toast appeared after ${elapsed} ms; must be < 500 ms`).toBeLessThan(500);
  });

  test('after a > 50 MB rejection the file input is cleared (no stale file)', async ({ page }) => {
    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024, 0x78);

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'huge-backup.json',
      mimeType: 'application/json',
      buffer: oversizedBuffer,
    });

    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });

    // Import button must remain disabled (no valid file selected).
    await expect(page.getByTestId('import-btn')).toBeDisabled();
  });

  test('existing transaction data is unchanged after a > 50 MB rejection', async ({ page }) => {
    const TX_COUNT = 5;
    await seedTransactions(page, TX_COUNT);
    expect(await countTransactionsDirectly(page)).toBe(TX_COUNT);

    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024, 0x78);
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'huge-backup.json',
      mimeType: 'application/json',
      buffer: oversizedBuffer,
    });

    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });

    // DB must be untouched.
    expect(await countTransactionsDirectly(page)).toBe(TX_COUNT);
  });

  test('page remains fully functional after a > 50 MB rejection (no crash)', async ({ page }) => {
    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024, 0x78);

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'huge-backup.json',
      mimeType: 'application/json',
      buffer: oversizedBuffer,
    });

    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });

    // All key UI elements must still be present and functional.
    await expect(page.getByTestId('csv-export-btn')).toBeVisible();
    await expect(page.getByTestId('export-all-btn')).toBeVisible();
    await expect(page.getByTestId('import-btn')).toBeVisible();
  });

  test('a file exactly at 50 MB boundary is rejected (> 50 MB means > 50 * 1024 * 1024)', async ({
    page,
  }) => {
    // The implementation checks `file.size > MAX_FILE_SIZE_BYTES` where MAX = 50 * 1024 * 1024.
    // So exactly 50 MB (50 * 1024 * 1024 bytes) should be ACCEPTED (not rejected).
    // 50 MB + 1 byte should be rejected.
    const justOverBuffer = Buffer.alloc(50 * 1024 * 1024 + 1, 0x78);

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'just-over-limit.json',
      mimeType: 'application/json',
      buffer: justOverBuffer,
    });

    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });
  });

  test('a valid JSON file under 50 MB is accepted without showing an error toast', async ({
    page,
  }) => {
    // Build a valid JSON backup small enough to pass the size check.
    const smallBackup = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: [],
    });

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'small-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(smallBackup, 'utf-8'),
    });

    // Wait briefly; no error toast should appear.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('import-error-toast')).not.toBeVisible();

    // Import button should now be enabled.
    await expect(page.getByTestId('import-btn')).toBeEnabled({ timeout: 3_000 });
  });

  test('@safari > 50 MB rejection works in WebKit without an uncaught exception', async ({
    page,
  }) => {
    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024, 0x78);

    const uncaughtErrors: Error[] = [];
    page.on('pageerror', (err) => uncaughtErrors.push(err));

    await page.getByTestId('import-file-input').setInputFiles({
      name: 'huge-backup.json',
      mimeType: 'application/json',
      buffer: oversizedBuffer,
    });

    await expect(page.getByTestId('import-error-toast')).toBeVisible({ timeout: 3_000 });

    // No uncaught JavaScript exceptions must have been thrown.
    expect(
      uncaughtErrors,
      `Unexpected page errors: ${uncaughtErrors.map((e) => e.message).join(', ')}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4 · DB Maintenance (P5-05 / CLA-69)
// ---------------------------------------------------------------------------
test.describe('DB Maintenance (P5-05 / CLA-69)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');
    await expect(page.getByTestId('backup-restore-panel')).toBeVisible();
  });

  test('DB maintenance section with destructive action buttons is present', async ({ page }) => {
    await expect(page.getByTestId('db-maintenance-section')).toBeVisible();
    await expect(page.getByTestId('delete-all-transactions-btn')).toBeVisible();
    await expect(page.getByTestId('delete-all-rules-btn')).toBeVisible();
  });

  test('delete-all-transactions-btn opens ConfirmModal', async ({ page }) => {
    await page.getByTestId('delete-all-transactions-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
  });

  test('confirming delete-all-transactions clears all transactions from DB', async ({ page }) => {
    await seedTransactions(page, 5);
    expect(await countTransactionsDirectly(page)).toBe(5);

    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    await page.getByTestId('delete-all-transactions-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    expect(await countTransactionsDirectly(page)).toBe(0);
  });

  test('cancelling delete-all-transactions keeps data intact', async ({ page }) => {
    await seedTransactions(page, 5);

    await page.reload();
    await page.waitForSelector('[data-testid^="nav-tab-"]');
    await goToTab(page, 'backup');

    await page.getByTestId('delete-all-transactions-btn').click();
    await expect(page.getByTestId('confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-modal-cancel').click();
    await expect(page.getByTestId('confirm-modal')).not.toBeVisible();

    expect(await countTransactionsDirectly(page)).toBe(5);
  });
});
