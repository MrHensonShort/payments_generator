/**
 * useTransactions – React hook for loading all transactions from the backend API.
 *
 * Provides a live list with polling, plus count and CRUD helpers.
 * Reads from GET /api/v1/transactions and writes via DELETE/PUT endpoints.
 * Shows an error when no API key is configured.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  fetchTransactions,
  deleteTransaction as apiDeleteTransaction,
  updateTransaction as apiUpdateTransaction,
  deleteAllTransactions as apiDeleteAllTransactions,
  getApiKey,
} from '@/infrastructure/api';
import type { ApiTransaction } from '@/infrastructure/api';
import type { TransactionEntry } from '@/infrastructure/database';

export interface UseTransactionsResult {
  transactions: TransactionEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  updateTransaction: (id: string, changes: Partial<Omit<TransactionEntry, 'id'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export function useTransactions(): UseTransactionsResult {
  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!getApiKey()) {
      setError('Kein API-Key konfiguriert. Bitte API-Key in den Einstellungen hinterlegen.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchTransactions()
      .then((all) => {
        // ApiTransaction and TransactionEntry share the same shape
        const entries = all as unknown as TransactionEntry[];
        // Sort by date desc, then time desc
        entries.sort((a, b) => {
          const d = b.date.localeCompare(a.date);
          return d !== 0 ? d : b.time.localeCompare(a.time);
        });
        setTransactions(entries);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    // Poll every 3 s so the table refreshes after generation completes
    const id = setInterval(reload, 3000);
    return () => clearInterval(id);
  }, [reload]);

  const updateTransaction = useCallback(
    async (id: string, changes: Partial<Omit<TransactionEntry, 'id'>>) => {
      await apiUpdateTransaction(id, changes as Partial<Omit<ApiTransaction, 'id'>>);
      reload();
    },
    [reload],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      await apiDeleteTransaction(id);
      reload();
    },
    [reload],
  );

  const clearAll = useCallback(async () => {
    await apiDeleteAllTransactions();
    reload();
  }, [reload]);

  return { transactions, loading, error, reload, updateTransaction, deleteTransaction, clearAll };
}

/**
 * useTransactionCount – lightweight count for use in sidebar badge.
 * Polls the backend every 3 s to stay in sync after generation.
 */
export function useTransactionCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!getApiKey()) return;

    const refresh = () =>
      fetchTransactions()
        .then((txs) => setCount(txs.length))
        .catch(() => {});

    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  return count;
}
