/**
 * src/auth/apiKey.ts
 *
 * API key utilities (P6-03 / CLA-72).
 *
 * - `generateRawKey()`:  256-bit cryptographically random hex string.
 * - `hashKey(raw)`:      SHA-256 of the raw key → 64-char hex digest.
 * - `keyPrefix(raw)`:    First 8 characters (visible identifier for key listing).
 */

import { createHash, randomBytes } from 'node:crypto';

/** Length of the raw key in bytes (256 bits). */
const KEY_BYTES = 32;

/**
 * Generate a new 256-bit API key.
 *
 * @returns 64-character lowercase hex string.
 */
export function generateRawKey(): string {
  return randomBytes(KEY_BYTES).toString('hex');
}

/**
 * Hash an API key for secure storage.
 *
 * Uses SHA-256, which is appropriate for high-entropy API keys.
 * (bcrypt is unnecessary here because the input has 256 bits of entropy.)
 *
 * @param rawKey - The raw key returned to the caller.
 * @returns 64-character hex digest.
 */
export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Return the first 8 characters of the raw key for display purposes.
 *
 * @param rawKey - The raw key (only available at creation time).
 */
export function keyPrefix(rawKey: string): string {
  return rawKey.slice(0, 8);
}
