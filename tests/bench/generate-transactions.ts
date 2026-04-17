/**
 * tests/bench/generate-transactions.ts
 *
 * Shared transaction-generation utility for TR-05 benchmarks.
 *
 * Produces synthetic SEPA/instant payment transactions spread evenly across
 * 2020-01-01 – 2024-12-31.  This stand-in exercises the same CPU-bound work
 * (object allocation, date arithmetic, array building) as the real generation
 * pipeline that will be implemented in Phase 3 (P3-04).
 *
 * 219k transactions ≈ 5 years × ~120 tx/day × 30 rules.
 */

export interface Transaction {
  id: string;
  /** ISO-8601 date, e.g. "2023-07-15". */
  date: string;
  /** Amount in euro-cents, e.g. 4200 = €42.00. */
  amount: number;
  paymentMode: 'sepa' | 'instant';
  stateCode: string;
  ruleId: string;
}

const START_MS = new Date('2020-01-01').getTime();
const END_MS = new Date('2024-12-31').getTime();
const RANGE_MS = END_MS - START_MS;

/**
 * Generates `count` synthetic payment transactions.
 *
 * All values are deterministic (no Math.random) so the function produces
 * identical results on every call — important for reproducible benchmarks.
 *
 * @param count Number of transactions to generate (worst case: 219 000).
 */
export function generateTransactions(count: number): Transaction[] {
  const result: Transaction[] = new Array(count);

  for (let i = 0; i < count; i++) {
    // Distribute transactions evenly across the 5-year date range.
    const dateMs = START_MS + Math.floor((i / count) * RANGE_MS);
    const date = new Date(dateMs).toISOString().slice(0, 10);

    result[i] = {
      id: `tx-${i}`,
      date,
      // Amounts cycle through €1.00 – €100.00 (1 to 10000 cents).
      amount: 100 + (i % 9901),
      paymentMode: i % 3 === 0 ? 'instant' : 'sepa',
      stateCode: 'AT-9',
      // 30 simulated payment rules.
      ruleId: `rule-${i % 30}`,
    };
  }

  return result;
}
