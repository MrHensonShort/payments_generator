/**
 * src/infrastructure/api/__tests__/transactionsApi.test.ts
 *
 * Unit tests for batchUploadTransactions (P6-05 / CLA-74).
 *
 * Verifies the batch-chunking acceptance criteria:
 *   "25k Tx → 3 Requests (10k + 10k + 5k)"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchUploadTransactions, BATCH_CHUNK_SIZE } from '../transactionsApi';
import * as apiClient from '../apiClient';
import type { ApiTransaction } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTxs(n: number): ApiTransaction[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tx-${i}`,
    date: '2024-01-01',
    time: '12:00',
    amount: 10,
    purpose: 'Test',
    counterparty: 'Counterparty',
    category: 'Other',
    source: 'manual' as const,
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('batchUploadTransactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends 0 requests and returns zero counts for an empty array', async () => {
    const spy = vi.spyOn(apiClient, 'apiRequest');
    const result = await batchUploadTransactions([]);
    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual({ imported: 0, skipped: 0 });
  });

  it('sends exactly 1 request for ≤ BATCH_CHUNK_SIZE transactions', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue({ imported: 5_000, skipped: 0 });
    const result = await batchUploadTransactions(makeTxs(5_000));
    expect(apiClient.apiRequest).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(5_000);
  });

  it('sends exactly 1 request when count equals BATCH_CHUNK_SIZE', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue({ imported: BATCH_CHUNK_SIZE, skipped: 0 });
    await batchUploadTransactions(makeTxs(BATCH_CHUNK_SIZE));
    expect(apiClient.apiRequest).toHaveBeenCalledTimes(1);
  });

  it('sends 3 requests for 25 000 transactions (10k + 10k + 5k) — acceptance criterion', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue({ imported: 10_000, skipped: 0 });
    const txs = makeTxs(25_000);
    await batchUploadTransactions(txs);

    expect(apiClient.apiRequest).toHaveBeenCalledTimes(3);

    const calls = vi.mocked(apiClient.apiRequest).mock.calls;
    expect((calls[0][2] as { transactions: ApiTransaction[] }).transactions).toHaveLength(10_000);
    expect((calls[1][2] as { transactions: ApiTransaction[] }).transactions).toHaveLength(10_000);
    expect((calls[2][2] as { transactions: ApiTransaction[] }).transactions).toHaveLength(5_000);
  });

  it('reports progress after each chunk with correct (sent, total) values', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue({ imported: 10_000, skipped: 0 });
    const onProgress = vi.fn();
    await batchUploadTransactions(makeTxs(25_000), onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 10_000, 25_000);
    expect(onProgress).toHaveBeenNthCalledWith(2, 20_000, 25_000);
    expect(onProgress).toHaveBeenNthCalledWith(3, 25_000, 25_000);
  });

  it('accumulates imported + skipped counts across all chunks', async () => {
    vi.spyOn(apiClient, 'apiRequest')
      .mockResolvedValueOnce({ imported: 9_000, skipped: 1_000 })
      .mockResolvedValueOnce({ imported: 8_500, skipped: 1_500 })
      .mockResolvedValueOnce({ imported: 4_000, skipped: 1_000 });

    const result = await batchUploadTransactions(makeTxs(25_000));
    expect(result.imported).toBe(21_500);
    expect(result.skipped).toBe(3_500);
  });

  it('sends only the remainder in the last chunk (e.g. 1 tx after a full chunk)', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue({ imported: 1, skipped: 0 });
    await batchUploadTransactions(makeTxs(BATCH_CHUNK_SIZE + 1));
    expect(apiClient.apiRequest).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(apiClient.apiRequest).mock.calls;
    expect((calls[1][2] as { transactions: ApiTransaction[] }).transactions).toHaveLength(1);
  });

  it('propagates ApiError from a failed chunk without swallowing it', async () => {
    const { ApiError } = await import('../types');
    vi.spyOn(apiClient, 'apiRequest').mockRejectedValue(new ApiError(401, 'Unauthorized'));
    await expect(batchUploadTransactions(makeTxs(500))).rejects.toBeInstanceOf(ApiError);
  });
});
