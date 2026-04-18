/**
 * useTransactions – React hook for loading all transactions from IndexedDB.
 *
 * Provides a live list with polling, plus count and CRUD helpers.
 */
import { useState, useEffect, useCallback } from 'react';
import { db } from '@/infrastructure/database';
import { TransactionRepo } from '@/infrastructure/transactionRepo';
import type { TransactionEntry } from '@/infrastructure/database';

const repo = new TransactionRepo(db);

export interface UseTransactionsResult {
  transactions: TransactionEntry[];
  loading: boolean;
  reload: () => void;
  updateTransaction: (id: string, changes: Partial<Omit<TransactionEntry, 'id'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export function useTransactions(): UseTransactionsResult {
  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    repo
      .getAll()
      .then((all) => {
        // Sort by date desc, then time desc
        all.sort((a, b) => {
          const d = b.date.localeCompare(a.date);
          return d !== 0 ? d : b.time.localeCompare(a.time);
        });
        setTransactions(all);
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
      await repo.update(id, changes);
      reload();
    },
    [reload],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      await repo.delete(id);
      reload();
    },
    [reload],
  );

  const clearAll = useCallback(async () => {
    await repo.clearAll();
    reload();
  }, [reload]);

  return { transactions, loading, reload, updateTransaction, deleteTransaction, clearAll };
}

/**
 * useTransactionCount – lightweight count for use in sidebar badge.
 */
export function useTransactionCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => repo.getAll().then((all) => setCount(all.length));
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  return count;
}
