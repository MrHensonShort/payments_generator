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

/**
 * Generate a UUID v4 string using the supplied RNG.
 *
 * When `rng` is a seeded function, the result is deterministic – identical
 * calls with the same RNG state produce the same UUID.  This satisfies the
 * E-03 determinism requirement for transaction IDs.
 *
 * Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` (RFC 4122 §4.4)
 *
 * @param rng - The RNG function to use (seeded or Math.random).
 */
export function seededUUID(rng: RngFn): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  // Set version to 4 (bits 4-7 of byte 6).
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // Set variant to 10xx (bits 6-7 of byte 8).
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((b) => b!.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}
