/**
 * useRules – React hook for loading and managing rules from IndexedDB.
 *
 * Provides a live list of all rules, filtered by type, plus CRUD helpers.
 * Triggers a re-fetch after each mutation so the UI stays in sync.
 */
import { useState, useEffect, useCallback } from 'react';
import { liveQuery } from 'dexie';
import { db } from '@/infrastructure/database';
import { RuleRepo } from '@/infrastructure/ruleRepo';
import type { RuleEntry } from '@/infrastructure/database';

const repo = new RuleRepo(db);

export type RuleType = 'recurring' | 'episode' | 'scatter';

export interface UseRulesResult {
  rules: RuleEntry[];
  loading: boolean;
  reload: () => void;
  addRule: (rule: RuleEntry) => Promise<void>;
  updateRule: (id: string, changes: Partial<Omit<RuleEntry, 'id'>>) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
}

/**
 * @param filterType - Optional rule type filter.  When provided, only rules
 *   of that type are returned.  Filtering happens client-side after loading
 *   all rules from IndexedDB.
 */
export function useRules(filterType?: RuleType): UseRulesResult {
  const [rules, setRules] = useState<RuleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    repo
      .getAll()
      .then((all) => {
        const filtered = filterType ? all.filter((r) => r.type === filterType) : all;
        // Sort by createdAt ascending
        filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setRules(filtered);
      })
      .finally(() => setLoading(false));
  }, [filterType]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addRule = useCallback(
    async (rule: RuleEntry) => {
      await repo.add(rule);
      reload();
    },
    [reload],
  );

  const updateRule = useCallback(
    async (id: string, changes: Partial<Omit<RuleEntry, 'id'>>) => {
      await repo.update(id, changes);
      reload();
    },
    [reload],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await repo.delete(id);
      reload();
    },
    [reload],
  );

  return { rules, loading, reload, addRule, updateRule, deleteRule };
}

/**
 * useAllRuleCount – lightweight hook that returns the total count of all rules.
 * Used by AppShell to display the rule count badge.
 */
export function useAllRuleCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const subscription = liveQuery(() => db.rules.count()).subscribe({
      next: setCount,
      error: (e) => console.error('useAllRuleCount', e),
    });
    return () => subscription.unsubscribe();
  }, []);

  return count;
}
