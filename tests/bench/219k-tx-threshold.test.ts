/**
 * tests/bench/219k-tx-threshold.test.ts
 *
 * TR-05: CI threshold gate — 219k-Tx must complete in < 5 s
 * ──────────────────────────────────────────────────────────
 * This regular Vitest test enforces the hard performance limit in CI.
 * It runs as part of the standard `vitest run` suite (picked up by the
 * default `**\/*.test.ts` include pattern).
 *
 * If the assertion fails, the build fails — intentionally.
 *
 * Running:
 *   npm test                            # included in the full test suite
 *   npx vitest run tests/bench          # run only the threshold gate
 *
 * For profiling metrics (ops/s, mean, p99) use the bench suite:
 *   npm run test:bench
 */

import { describe, it, expect } from 'vitest';
import { generateTransactions } from './generate-transactions.js';

/** Worst-case transaction count: 5 years × ~120 tx/day. */
const TX_COUNT = 219_000;

/** Hard CI limit defined in TR-05. */
const CI_THRESHOLD_MS = 5_000;

describe('219k-Tx Worst-Case — CI threshold gate (TR-05)', () => {
  it(`generates ${TX_COUNT.toLocaleString()} transactions in under ${CI_THRESHOLD_MS / 1000}s`, () => {
    const start = performance.now();
    const txs = generateTransactions(TX_COUNT);
    const elapsed = performance.now() - start;

    // All transactions must have been produced.
    expect(txs).toHaveLength(TX_COUNT);

    // Spot-check structure of first and last transaction.
    expect(txs[0]).toMatchObject({
      id: 'tx-0',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      paymentMode: expect.stringMatching(/^(sepa|instant)$/),
      stateCode: 'AT-9',
      ruleId: expect.stringMatching(/^rule-\d+$/),
    });
    expect(txs[TX_COUNT - 1].id).toBe(`tx-${TX_COUNT - 1}`);

    // CI hard limit: fail the build if generation exceeds 5 s.
    expect(
      elapsed,
      `TR-05: 219k-Tx generation took ${elapsed.toFixed(0)} ms — must be < ${CI_THRESHOLD_MS} ms`,
    ).toBeLessThan(CI_THRESHOLD_MS);
  });
});
