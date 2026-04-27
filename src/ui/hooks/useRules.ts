/**
 * useRules – React hook for loading and managing rules from the backend API.
 *
 * Provides a live list of all rules, filtered by type, plus CRUD helpers.
 * Triggers a re-fetch after each mutation so the UI stays in sync.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  fetchRules,
  createRule,
  updateRule as apiUpdateRule,
  deleteRule as apiDeleteRule,
  getApiKey,
} from '@/infrastructure/api';
import type { ApiRule } from '@/infrastructure/api';
import type { RuleEntry } from '@/infrastructure/database';

export type RuleType = 'recurring' | 'episode' | 'scatter';

export interface UseRulesResult {
  rules: RuleEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  addRule: (rule: RuleEntry) => Promise<void>;
  updateRule: (id: string, changes: Partial<Omit<RuleEntry, 'id'>>) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
}

/**
 * @param filterType - Optional rule type filter.  When provided, only rules
 *   of that type are returned.  Filtering happens client-side after loading
 *   all rules from the backend.
 */
export function useRules(filterType?: RuleType): UseRulesResult {
  const [rules, setRules] = useState<RuleEntry[]>([]);
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
    fetchRules()
      .then((all) => {
        // ApiRule and RuleEntry share the same shape
        const entries = all as unknown as RuleEntry[];
        const filtered = filterType ? entries.filter((r) => r.type === filterType) : entries;
        // Sort by createdAt ascending
        filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setRules(filtered);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [filterType]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addRule = useCallback(
    async (rule: RuleEntry) => {
      await createRule(rule as unknown as ApiRule);
      reload();
    },
    [reload],
  );

  const updateRule = useCallback(
    async (id: string, changes: Partial<Omit<RuleEntry, 'id'>>) => {
      const apiChanges: Partial<Pick<ApiRule, 'name' | 'config'>> = {};
      if (changes.name !== undefined) apiChanges.name = changes.name;
      if (changes.config !== undefined)
        apiChanges.config = changes.config as Record<string, unknown>;
      await apiUpdateRule(id, apiChanges);
      reload();
    },
    [reload],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await apiDeleteRule(id);
      reload();
    },
    [reload],
  );

  return { rules, loading, error, reload, addRule, updateRule, deleteRule };
}

/**
 * useAllRuleCount – lightweight hook that returns the total count of all rules.
 * Used by AppShell to display the rule count badge.
 */
export function useAllRuleCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!getApiKey()) return;

    fetchRules()
      .then((rules) => setCount(rules.length))
      .catch(() => {});
  }, []);

  return count;
}
