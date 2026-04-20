/**
 * src/infrastructure/api/rulesApi.ts
 *
 * Rules CRUD operations for the Payments Generator backend (P6-05 / CLA-74).
 * Mirrors the endpoints defined in backend/src/routes/rules.ts.
 *
 * GET    /api/v1/rules       – list all rules
 * POST   /api/v1/rules       – create a rule
 * PUT    /api/v1/rules/:id   – update name / config
 * DELETE /api/v1/rules/:id   – delete a rule
 */

import type { ApiRule } from './types';
import { apiRequest } from './apiClient';

/** Fetch all rules from the backend. */
export async function fetchRules(): Promise<ApiRule[]> {
  const data = await apiRequest<{ rules: ApiRule[] }>('GET', '/api/v1/rules');
  return data.rules;
}

/** Create a new rule on the backend. Returns the created rule (with server timestamps). */
export async function createRule(rule: ApiRule): Promise<ApiRule> {
  return apiRequest<ApiRule>('POST', '/api/v1/rules', rule);
}

/** Update an existing rule's name and/or config. */
export async function updateRule(
  id: string,
  changes: Partial<Pick<ApiRule, 'name' | 'config'>>,
): Promise<ApiRule> {
  return apiRequest<ApiRule>('PUT', `/api/v1/rules/${id}`, changes);
}

/** Delete a rule by id. */
export async function deleteRule(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/v1/rules/${id}`);
}
