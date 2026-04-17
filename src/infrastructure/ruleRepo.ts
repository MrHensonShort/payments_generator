/**
 * src/infrastructure/ruleRepo.ts
 *
 * Repository for RuleEntry CRUD operations (P1-03).
 *
 * All methods delegate to the Dexie `rules` table on the provided
 * PaymentsDatabase instance.  Callers are responsible for opening the
 * database before using the repository.
 */

import type { PaymentsDatabase, RuleEntry } from './database';

export class RuleRepo {
  constructor(private readonly db: PaymentsDatabase) {}

  /** Insert a new rule. Returns the primary key (UUID). */
  add(rule: RuleEntry): Promise<string> {
    return this.db.rules.add(rule);
  }

  /** Partially update an existing rule by id. */
  update(id: string, changes: Partial<Omit<RuleEntry, 'id'>>): Promise<void> {
    return this.db.rules.update(id, changes).then(() => undefined);
  }

  /** Delete a rule by id. No-op if id does not exist. */
  delete(id: string): Promise<void> {
    return this.db.rules.delete(id);
  }

  /** Return all rules (unordered). */
  getAll(): Promise<RuleEntry[]> {
    return this.db.rules.toArray();
  }

  /** Return a single rule by id, or undefined if not found. */
  getById(id: string): Promise<RuleEntry | undefined> {
    return this.db.rules.get(id);
  }

  /** Delete every rule in the store. */
  clearAll(): Promise<void> {
    return this.db.rules.clear();
  }
}
