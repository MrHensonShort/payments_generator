/**
 * src/infrastructure/transactionRepo.ts
 *
 * Repository for TransactionEntry CRUD operations (P1-03).
 *
 * All methods delegate to the Dexie `transactions` table on the provided
 * PaymentsDatabase instance.  Callers are responsible for opening the
 * database before using the repository.
 */

import type { PaymentsDatabase, TransactionEntry } from './database';

export class TransactionRepo {
  constructor(private readonly db: PaymentsDatabase) {}

  /** Insert a new transaction. Returns the primary key (UUID). */
  add(tx: TransactionEntry): Promise<string> {
    return this.db.transactions.add(tx);
  }

  /** Partially update an existing transaction by id. */
  update(id: string, changes: Partial<Omit<TransactionEntry, 'id'>>): Promise<void> {
    return this.db.transactions.update(id, changes).then(() => undefined);
  }

  /** Delete a transaction by id. No-op if id does not exist. */
  delete(id: string): Promise<void> {
    return this.db.transactions.delete(id);
  }

  /** Return all transactions (unordered). */
  getAll(): Promise<TransactionEntry[]> {
    return this.db.transactions.toArray();
  }

  /** Return a single transaction by id, or undefined if not found. */
  getById(id: string): Promise<TransactionEntry | undefined> {
    return this.db.transactions.get(id);
  }

  /** Delete every transaction in the store. */
  clearAll(): Promise<void> {
    return this.db.transactions.clear();
  }
}
