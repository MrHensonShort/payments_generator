/**
 * src/workers/comlinkShim.ts
 *
 * Minimal Comlink-compatible shim for generationWorker.ts.
 *
 * Implements the same message protocol as real Comlink so the worker can be
 * wrapped with `Comlink.wrap()` on the main thread after installing:
 *   npm install comlink
 *
 * When comlink is installed, replace this shim's usage in generationWorker.ts
 * with a direct `import * as Comlink from 'comlink'` and call `Comlink.expose`.
 *
 * Protocol (mirrors Comlink internal wire format subset):
 *   Main → Worker: { id, type: 'GET' | 'APPLY', path, argumentList }
 *   Worker → Main: { id, value } | { id, error }
 *
 * For progress callbacks (Comlink.proxy), callbacks arrive as:
 *   Main → Worker: { id, type: 'APPLY', path: ['generate'], argumentList: [...] }
 * and callback invocations are forwarded via:
 *   Worker → Main: { id: callbackId, type: 'APPLY', path: [...], argumentList: [...] }
 *
 * NOTE: This shim uses a simplified subset of the Comlink protocol sufficient
 * for `generate(ruleIds, config, onProgress, signal)`.  It does not implement
 * transferable or complex Comlink proxy semantics.
 */

/** Expose an API object in the current Worker context via postMessage. */
export function expose(api: Record<string, (...args: unknown[]) => unknown>): void {
  if (typeof self === 'undefined' || typeof addEventListener === 'undefined') {
    // Not in a Worker context (e.g. Node test environment) – no-op.
    return;
  }

  addEventListener('message', async (ev: MessageEvent) => {
    const { id, method, args } = ev.data as {
      id: string;
      method: string;
      args: unknown[];
    };

    if (typeof method !== 'string' || !(method in api)) return;

    try {
      const fn = api[method];
      if (typeof fn !== 'function') throw new TypeError(`${method} is not a function`);
      const result = await fn(...args);
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
        id,
        result,
      });
    } catch (err: unknown) {
      const error =
        err instanceof Error
          ? { message: err.message, name: err.name }
          : { message: String(err), name: 'Error' };
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
        id,
        error,
      });
    }
  });
}
