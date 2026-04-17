/**
 * tests/bench/219k-tx.bench.ts
 *
 * TR-05: Vitest Bench — 219k-Tx Worst-Case
 * ─────────────────────────────────────────
 * Bench suite for the 219 000-transaction worst-case scenario.
 *
 * Running:
 *   npm run test:bench                         # full profiling output
 *   npx vitest bench --reporter=verbose        # verbose timing table
 *
 * ── Context ─────────────────────────────────────────────────────────────────
 * 219k transactions represent the worst-case load for the generation pipeline
 * (5 years × ~120 tx/day across 30 concurrent rules).  Phase-0 benchmarks the
 * in-memory data-generation step; IndexedDB write performance is deferred to
 * Phase-3 browser integration tests (P3-04).
 *
 * ── CI threshold ────────────────────────────────────────────────────────────
 * The hard 5-second limit is enforced by `tests/bench/219k-tx-threshold.test.ts`
 * which runs as part of the normal `vitest run` suite.
 */

import { bench, describe } from 'vitest';
import { generateTransactions } from './generate-transactions.js';

// ── Bench suite ──────────────────────────────────────────────────────────────

describe('219k-Tx Worst-Case (TR-05)', () => {
  bench(
    'generate 219 000 transactions (worst case)',
    () => {
      generateTransactions(219_000);
    },
    {
      // Keep iterations low: each run allocates ~219k objects.
      iterations: 3,
      warmupIterations: 1,
    },
  );

  bench(
    'generate 1 000 transactions (baseline)',
    () => {
      generateTransactions(1_000);
    },
  );
});
