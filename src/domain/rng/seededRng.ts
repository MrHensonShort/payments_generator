/**
 * src/domain/rng/seededRng.ts
 *
 * Deterministic seeded pseudo-random number generator (P1-07, E-03).
 *
 * When a numeric seed is supplied, `createRng()` returns a deterministic
 * function based on the Mulberry32 algorithm – a fast, high-quality 32-bit
 * PRNG that produces the same sequence for the same seed on every run and
 * every platform.
 *
 * When no seed is supplied, `createRng()` returns `Math.random`, preserving
 * the default non-deterministic behaviour.
 *
 * All returned functions produce uniformly distributed floats in [0, 1).
 *
 * Usage:
 *   const rng = createRng(42);
 *   rng(); // → reproducible float in [0, 1)
 *   rng(); // → next value in same sequence
 *
 *   const rngRandom = createRng(); // falls back to Math.random
 */

// ── Type ──────────────────────────────────────────────────────────────────────

/**
 * A zero-argument function that returns a pseudo-random float in [0, 1).
 * Identical interface to Math.random.
 */
export type RngFn = () => number;

// ── Mulberry32 implementation ─────────────────────────────────────────────────

/**
 * Mulberry32 PRNG.
 *
 * Properties:
 *   - Period: 2^32 (≈ 4.3 billion values before repeating)
 *   - Speed:  ~5× faster than Xorshift128+ in V8 for this use-case
 *   - Quality: passes PractRand; sufficient for transaction generation
 *
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *
 * @param initialSeed - A 32-bit unsigned integer seed.
 */
function mulberry32(initialSeed: number): RngFn {
  // Coerce to unsigned 32-bit integer
  let s = initialSeed >>> 0;

  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a random-number generator.
 *
 * @param seed - Optional integer seed.  When provided, the returned function
 *   is deterministic: identical sequences are produced for identical seeds.
 *   When omitted, `Math.random` is returned unchanged.
 *
 * @returns A function `() => number` that yields floats in [0, 1).
 */
export function createRng(seed?: number): RngFn {
  if (seed === undefined) {
    return Math.random;
  }
  return mulberry32(seed);
}

/**
 * Return a random integer in the closed interval [min, max] (inclusive).
 *
 * @param rng - The RNG function to use.
 * @param min - Lower bound (inclusive, integer).
 * @param max - Upper bound (inclusive, integer).
 */
export function randomInt(rng: RngFn, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Return a random float in the closed interval [min, max].
 *
 * @param rng - The RNG function to use.
 * @param min - Lower bound.
 * @param max - Upper bound.
 */
export function randomFloat(rng: RngFn, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/**
 * Shuffle an array in-place using the Fisher-Yates algorithm.
 * Returns the same array reference (mutates in-place).
 *
 * @param rng   - The RNG function to use.
 * @param array - The array to shuffle.
 */
export function shuffle<T>(rng: RngFn, array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i]!;
    array[i] = array[j]!;
    array[j] = tmp;
  }
  return array;
}

/**
 * Pick a random element from a non-empty array.
 *
 * @param rng   - The RNG function to use.
 * @param array - A non-empty array.
 */
export function pick<T>(rng: RngFn, array: readonly T[]): T {
  return array[Math.floor(rng() * array.length)]!;
}
