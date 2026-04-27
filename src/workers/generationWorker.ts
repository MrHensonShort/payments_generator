/**
 * src/workers/generationWorker.ts
 *
 * Web Worker entry point for transaction generation (P3-04 / CLA-38).
 *
 * When apiUrl and apiKey are present in the GenerationConfig:
 *   - Rules are fetched from GET /api/v1/rules (backend).
 *   - Generated transactions are sent to POST /api/v1/transactions/batch (backend).
 * Otherwise, falls back to the legacy IndexedDB path.
 *
 * Exposes a GenerationWorkerAPI via a Comlink-compatible message protocol so
 * the main thread can call generate() as if it were a regular async function
 * while the computation runs off the main thread.
 */

import { expose } from 'comlink';
import { db } from '../infrastructure/database.js';
import { RuleRepo } from '../infrastructure/ruleRepo.js';
import { GenerationOrchestrator } from '../domain/GenerationOrchestrator.js';
import type { FederalState } from '../domain/calendar/WorkingDayCalendar.js';
import type { AnyRule, GenerationContext, Transaction } from '../domain/types.js';
import type { GenerationConfig, GenerationWorkerAPI } from './workerTypes.js';
import type {
  GenerationProgressEvent,
  GenerationResult,
} from '../domain/GenerationOrchestrator.js';

// Re-export types for main-thread import convenience.
export type { GenerationConfig, GenerationWorkerAPI, GenerationProgressEvent, GenerationResult };

// ── Worker-local singletons ───────────────────────────────────────────────────

const ruleRepo = new RuleRepo(db);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch all rules from the backend and return as AnyRule[], filtered by ruleIds. */
async function fetchRulesFromBackend(
  apiUrl: string,
  apiKey: string,
  ruleIds: string[],
): Promise<AnyRule[]> {
  const response = await fetch(`${apiUrl}/api/v1/rules`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Failed to fetch rules: HTTP ${response.status}`);
  const data = (await response.json()) as { rules: Array<{ id: string; config: unknown }> };
  const filtered =
    ruleIds.length === 0 ? data.rules : data.rules.filter((r) => ruleIds.includes(r.id));
  return filtered.map((r) => r.config as AnyRule);
}

/** POST a chunk of transactions to the backend batch endpoint. */
async function postTransactionsToBackend(
  apiUrl: string,
  apiKey: string,
  entries: Transaction[],
): Promise<void> {
  const transactions = entries.map((e) => ({
    id: e.id,
    date: e.date,
    time: e.time,
    amount: e.amount,
    purpose: e.purpose,
    counterparty: e.counterparty,
    category: e.category,
    source: e.source,
    ruleId: e.ruleId ?? null,
  }));
  const response = await fetch(`${apiUrl}/api/v1/transactions/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ transactions }),
  });
  if (!response.ok) throw new Error(`Failed to upload transactions: HTTP ${response.status}`);
}

// ── Worker API implementation ─────────────────────────────────────────────────

const workerApi: GenerationWorkerAPI = {
  async generate(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: (event: GenerationProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const start = Date.now();
    const useBackend = !!(config.apiUrl && config.apiKey);

    // Load rules – from backend if API config is available, else from IndexedDB.
    let rules: AnyRule[];
    if (useBackend) {
      rules = await fetchRulesFromBackend(config.apiUrl!, config.apiKey!, ruleIds);
    } else {
      const allEntries = await ruleRepo.getAll();
      const filtered =
        ruleIds.length === 0 ? allEntries : allEntries.filter((e) => ruleIds.includes(e.id));
      rules = filtered.map((e) => e.config as AnyRule);
    }

    // Build flush function – send to backend or write to IndexedDB.
    const bulkInsert = useBackend
      ? async (entries: Transaction[]) => {
          await postTransactionsToBackend(config.apiUrl!, config.apiKey!, entries);
        }
      : async (entries: Transaction[]) => {
          await db.transactions.bulkAdd(
            entries as unknown as Parameters<typeof db.transactions.bulkAdd>[0],
          );
        };

    const orchestrator = new GenerationOrchestrator(bulkInsert);

    // Build GenerationContext from incoming config.
    const context: GenerationContext = {
      startDate: config.startDate,
      endDate: config.endDate,
      paymentMode: config.paymentMode ?? 'sepa',
      federalState: (config.stateCode ?? 'DE-BY') as FederalState,
      globalSeed: config.seed,
    };

    const result = await orchestrator.generate(rules, context, onProgress, signal);

    return {
      transactionCount: result.transactionCount,
      durationMs: Date.now() - start,
    };
  },
};

// Expose the API via Comlink-compatible message protocol.
expose(workerApi as unknown as Record<string, (...args: unknown[]) => unknown>);
