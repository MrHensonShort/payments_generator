/**
 * src/infrastructure/api/transactionsApi.ts
 *
 * Transaction API operations for the Payments Generator backend (P6-05 / CLA-74).
 *
 * The backend accepts at most BATCH_CHUNK_SIZE (10 000) transactions per request.
 * `batchUploadTransactions` automatically splits larger inputs into chunks and
 * reports progress via an optional callback:
 *
 *   25 000 transactions → 3 requests:  10 000 + 10 000 + 5 000
 */

import type { ApiTransaction, BatchImportResult, ProgressCallback } from './types';
import { apiRequest } from './apiClient';

/** Maximum transactions allowed in a single batch POST (matches server limit). */
export const BATCH_CHUNK_SIZE = 10_000;

/**
 * Upload transactions to the backend in chunks of BATCH_CHUNK_SIZE.
 *
 * Calls `onProgress(sent, total)` after each chunk so the UI can show progress.
 * Accumulates the `imported` / `skipped` counts returned by the server.
 *
 * Acceptance criteria: 25k Tx → 3 requests (10k + 10k + 5k).
 *
 * @param transactions - Full list of transactions to upload.
 * @param onProgress   - Optional callback invoked after each chunk.
 * @returns Aggregated import result across all chunks.
 */
export async function batchUploadTransactions(
  transactions: ApiTransaction[],
  onProgress?: ProgressCallback,
): Promise<BatchImportResult> {
  const total = transactions.length;
  let imported = 0;
  let skipped = 0;
  let sent = 0;

  for (let offset = 0; offset < total; offset += BATCH_CHUNK_SIZE) {
    const chunk = transactions.slice(offset, offset + BATCH_CHUNK_SIZE);
    const result = await apiRequest<BatchImportResult>('POST', '/api/v1/transactions/batch', {
      transactions: chunk,
    });
    imported += result.imported ?? chunk.length;
    skipped += result.skipped ?? 0;
    sent += chunk.length;
    onProgress?.(sent, total);
  }

  return { imported, skipped };
}

/**
 * Fetch all transactions from the backend.
 *
 * The server supports cursor-based pagination; this implementation fetches
 * the first page. Extend with cursor handling if large server datasets require it.
 */
export async function fetchTransactions(): Promise<ApiTransaction[]> {
  const data = await apiRequest<{ transactions: ApiTransaction[]; nextCursor?: string }>(
    'GET',
    '/api/v1/transactions',
  );
  return data.transactions;
}

/** Update a single transaction on the backend. */
export async function updateTransaction(
  id: string,
  changes: Partial<Omit<ApiTransaction, 'id'>>,
): Promise<void> {
  await apiRequest('PUT', `/api/v1/transactions/${id}`, changes);
}

/** Delete a single transaction from the backend. */
export async function deleteTransaction(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/v1/transactions/${id}`);
}

/** Delete all transactions from the backend (bulk delete). */
export async function deleteAllTransactions(): Promise<void> {
  await apiRequest('DELETE', '/api/v1/transactions');
}
