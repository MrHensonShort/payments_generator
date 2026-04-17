/**
 * Minimal type declarations for the `comlink` package.
 *
 * These stubs allow TypeScript to compile while `comlink` is not yet installed
 * as a node_modules dependency.  They mirror the subset of the Comlink API
 * used by `WorkerProxy.ts` (wrap + proxy).
 *
 * Once `npm install comlink` is run the real types from `comlink/dist/umd/comlink.d.ts`
 * will be available; these stubs can then be removed (skipLibCheck: true in
 * tsconfig means there is no risk of conflict until then).
 *
 * Full Comlink API: https://github.com/GoogleChromeLabs/comlink
 */
declare module 'comlink' {
  /** Wraps a Worker endpoint with a proxy that mirrors the exposed API. */
  export function wrap<T>(endpoint: Worker | MessagePort): T;

  /**
   * Marks a value as a Comlink proxy so it is transferred as a proxy object
   * (rather than being structured-cloned) across the Worker boundary.
   * Used to pass callbacks (e.g. progress handlers) to the Worker.
   */
  export function proxy<T>(value: T): T;

  /** Exposes a value on a Worker endpoint so it can be accessed via `wrap`. */
  export function expose(value: unknown, endpoint?: Worker | MessagePort): void;

  /**
   * Helper to transfer `Transferable` objects alongside a message.
   * Wraps a value with an additional set of transferables.
   */
  export function transfer<T>(value: T, transferables: Transferable[]): T;
}
