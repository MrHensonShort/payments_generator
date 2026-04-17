/**
 * src/test/helpers/idb.ts
 *
 * Re-exports the IDB reset helper for use in test files.
 * Import this file instead of vitest.setup.ts directly to avoid coupling
 * test helpers to the setup file path.
 *
 * Usage:
 * ```ts
 * import { resetIDBFactory } from '../test/helpers/idb';
 *
 * beforeEach(() => {
 *   resetIDBFactory();
 * });
 * ```
 */
export { resetIDBFactory } from '../../../vitest.setup';
// Note: path resolves to project-root/vitest.setup.ts (3 levels up from src/test/helpers/)
// Adjust the relative path if this file moves.
