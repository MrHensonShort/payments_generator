/**
 * src/infrastructure/api/apiKeyStorage.ts
 *
 * Pure localStorage accessors for the backend API key and server URL (P6-05).
 *
 * These are intentionally NOT stored in Zustand (or any React state) so that
 * the sensitive key never appears in React DevTools or state snapshots.
 * The functions are synchronous and always read the latest value directly from
 * localStorage, so changes in the settings UI are reflected immediately on the
 * next API call without a page reload.
 */

const STORAGE_KEY_API_KEY = 'pc-api-key';
const STORAGE_KEY_API_URL = 'pc-api-url';

/** Default backend URL used when no custom URL has been configured. */
export const DEFAULT_API_URL = 'http://localhost:3001';

// ── API Key ───────────────────────────────────────────────────────────────────

/**
 * Read the API key from localStorage.
 * Returns an empty string if no key has been stored yet.
 */
export function getApiKey(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY_API_KEY) ?? '';
}

/**
 * Persist the API key to localStorage.
 * Pass an empty string (or call without argument) to clear the stored key.
 */
export function setApiKey(key: string): void {
  if (key) {
    localStorage.setItem(STORAGE_KEY_API_KEY, key);
  } else {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
  }
}

// ── Server URL ────────────────────────────────────────────────────────────────

/**
 * Read the backend base URL from localStorage.
 * Falls back to DEFAULT_API_URL when not set.
 */
export function getApiUrl(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_API_URL;
  return localStorage.getItem(STORAGE_KEY_API_URL) ?? DEFAULT_API_URL;
}

/**
 * Persist the backend base URL to localStorage.
 * Trailing slashes are stripped. Pass an empty string to reset to default.
 */
export function setApiUrl(url: string): void {
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY_API_URL, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY_API_URL);
  }
}
