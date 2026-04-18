/**
 * src/infrastructure/api/types.ts
 *
 * Shared TypeScript types for the Payments Generator backend API (P6-05 / CLA-74).
 * Mirrors the Fastify route schemas defined in backend/src/routes/.
 */

/** Transaction shape used in API requests and responses. */
export interface ApiTransaction {
  id: string;
  date: string;
  time: string;
  amount: number;
  purpose: string;
  counterparty: string;
  category: string;
  source: 'recurring' | 'episode' | 'scatter' | 'manual';
  ruleId?: string | null;
}

/** Rule shape used in API requests and responses. */
export interface ApiRule {
  id: string;
  type: 'recurring' | 'episode' | 'scatter';
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
}

/** Response from POST /api/v1/transactions/batch. */
export interface BatchImportResult {
  imported: number;
  skipped: number;
}

/**
 * Progress callback for chunked batch uploads.
 *
 * @param sent   - Number of transactions sent so far.
 * @param total  - Total number of transactions to send.
 */
export type ProgressCallback = (sent: number, total: number) => void;

/**
 * Structured API error with HTTP status code.
 *
 * - `status === 0`   → network error (offline, CORS, DNS failure)
 * - `status === 401` → authentication failure (invalid / revoked API key)
 * - Other values     → HTTP error from the server
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request failed due to a missing or invalid API key. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when the request could not reach the server at all. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}
