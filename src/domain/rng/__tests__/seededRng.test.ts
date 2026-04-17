/**
 * src/domain/rng/__tests__/seededRng.test.ts
 *
 * Unit tests for seededRng.ts (CLA-28 / P1-07, E-03).
 *
 * Coverage areas:
 *   - createRng(): seed → deterministic output; no seed → Math.random
 *   - Reproducibility: same seed always yields identical sequence
 *   - Independence: different seeds yield different sequences
 *   - Output range: all values in [0, 1)
 *   - randomInt(): correct inclusive bounds
 *   - randomFloat(): correct range
 *   - shuffle(): in-place Fisher-Yates, reproducible
 *   - pick(): selects valid elements
 */

import { describe, expect, it, vi } from 'vitest';
import { createRng, randomFloat, randomInt, shuffle, pick } from '../seededRng';

// ── createRng() ───────────────────────────────────────────────────────────────

describe('createRng()', () => {
  describe('with seed', () => {
    it('returns a function', () => {
      const rng = createRng(42);
      expect(typeof rng).toBe('function');
    });

    it('returns values in [0, 1)', () => {
      const rng = createRng(1234);
      for (let i = 0; i < 1000; i++) {
        const v = rng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('produces the same sequence for the same seed (reproducibility)', () => {
      const rng1 = createRng(99);
      const rng2 = createRng(99);
      for (let i = 0; i < 20; i++) {
        expect(rng1()).toBe(rng2());
      }
    });

    it('produces a different sequence for a different seed', () => {
      const rng1 = createRng(1);
      const rng2 = createRng(2);
      const seq1 = Array.from({ length: 10 }, () => rng1());
      const seq2 = Array.from({ length: 10 }, () => rng2());
      expect(seq1).not.toEqual(seq2);
    });

    it('seed 0 works and produces deterministic output', () => {
      const rng1 = createRng(0);
      const rng2 = createRng(0);
      expect(rng1()).toBe(rng2());
    });

    it('seed with large integer works correctly', () => {
      const rng1 = createRng(0xdeadbeef);
      const rng2 = createRng(0xdeadbeef);
      expect(rng1()).toBe(rng2());
    });

    it('generates non-trivially distributed values across 1000 calls', () => {
      const rng = createRng(7);
      const values = Array.from({ length: 1000 }, () => rng());
      // Mean should be close to 0.5 (within 5% tolerance)
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean).toBeGreaterThan(0.45);
      expect(mean).toBeLessThan(0.55);
    });

    it('does not repeat the same value on consecutive calls (sufficient period)', () => {
      const rng = createRng(42);
      const a = rng();
      const b = rng();
      expect(a).not.toBe(b);
    });
  });

  describe('without seed (Math.random fallback)', () => {
    it('returns Math.random when no seed is provided', () => {
      const rng = createRng();
      expect(rng).toBe(Math.random);
    });

    it('returns Math.random when seed is undefined', () => {
      const rng = createRng(undefined);
      expect(rng).toBe(Math.random);
    });
  });
});

// ── randomInt() ───────────────────────────────────────────────────────────────

describe('randomInt()', () => {
  it('returns integer values only', () => {
    const rng = createRng(100);
    for (let i = 0; i < 100; i++) {
      const v = randomInt(rng, 1, 10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('values are within inclusive [min, max]', () => {
    const rng = createRng(200);
    for (let i = 0; i < 500; i++) {
      const v = randomInt(rng, 5, 15);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(15);
    }
  });

  it('can return the minimum bound', () => {
    const zeroRng = () => 0;
    expect(randomInt(zeroRng, 3, 10)).toBe(3);
  });

  it('can return the maximum bound', () => {
    const almostOneRng = () => 1 - Number.EPSILON;
    expect(randomInt(almostOneRng, 3, 10)).toBe(10);
  });

  it('works with min === max (degenerate range)', () => {
    const rng = createRng(1);
    expect(randomInt(rng, 7, 7)).toBe(7);
  });

  it('is deterministic with a seeded rng', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    for (let i = 0; i < 20; i++) {
      expect(randomInt(rng1, 1, 100)).toBe(randomInt(rng2, 1, 100));
    }
  });
});

// ── randomFloat() ─────────────────────────────────────────────────────────────

describe('randomFloat()', () => {
  it('returns values within [min, max]', () => {
    const rng = createRng(300);
    for (let i = 0; i < 200; i++) {
      const v = randomFloat(rng, -100, 100);
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic with a seeded rng', () => {
    const rng1 = createRng(55);
    const rng2 = createRng(55);
    for (let i = 0; i < 10; i++) {
      expect(randomFloat(rng1, 0, 500)).toBe(randomFloat(rng2, 0, 500));
    }
  });

  it('mean converges near midpoint of range', () => {
    const rng = createRng(999);
    const vals = Array.from({ length: 1000 }, () => randomFloat(rng, 10, 20));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(mean).toBeGreaterThan(14.5);
    expect(mean).toBeLessThan(15.5);
  });
});

// ── shuffle() ─────────────────────────────────────────────────────────────────

describe('shuffle()', () => {
  it('returns the same array reference (in-place mutation)', () => {
    const rng = createRng(11);
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(rng, arr);
    expect(result).toBe(arr);
  });

  it('contains all original elements after shuffle', () => {
    const rng = createRng(22);
    const arr = [1, 2, 3, 4, 5];
    shuffle(rng, arr);
    expect(arr.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('produces a deterministic permutation for the same seed', () => {
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];
    shuffle(createRng(33), arr1);
    shuffle(createRng(33), arr2);
    expect(arr1).toEqual(arr2);
  });

  it('produces a different permutation for a different seed', () => {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [...arr1];
    shuffle(createRng(44), arr1);
    shuffle(createRng(45), arr2);
    expect(arr1).not.toEqual(arr2);
  });

  it('handles an empty array without error', () => {
    const rng = createRng(1);
    const arr: number[] = [];
    expect(() => shuffle(rng, arr)).not.toThrow();
    expect(arr).toEqual([]);
  });

  it('handles a single-element array without error', () => {
    const rng = createRng(1);
    const arr = [42];
    shuffle(rng, arr);
    expect(arr).toEqual([42]);
  });
});

// ── pick() ────────────────────────────────────────────────────────────────────

describe('pick()', () => {
  it('returns an element from the array', () => {
    const rng = createRng(77);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 50; i++) {
      const v = pick(rng, arr);
      expect(arr).toContain(v);
    }
  });

  it('is deterministic with the same seed', () => {
    const arr = ['x', 'y', 'z'];
    const picks1 = Array.from({ length: 10 }, () => pick(createRng(88), arr));
    const picks2 = Array.from({ length: 10 }, () => pick(createRng(88), arr));
    expect(picks1).toEqual(picks2);
  });

  it('works with a single-element array', () => {
    const rng = createRng(1);
    expect(pick(rng, [42])).toBe(42);
  });

  it('uses Math.random when no seed provided (smoke test)', () => {
    // Spy must be set up BEFORE createRng() so rng captures the spy reference
    const spy = vi.spyOn(Math, 'random');
    const rng = createRng(); // rng === Math.random (currently the spy)
    pick(rng, [1, 2, 3]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
