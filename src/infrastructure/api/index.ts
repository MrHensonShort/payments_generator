/**
 * src/infrastructure/api/index.ts
 *
 * Public API for the backend HTTP client layer (P6-05 / CLA-74).
 */

export * from './types';
export * from './apiKeyStorage';
export {
  batchUploadTransactions,
  fetchTransactions,
  updateTransaction,
  deleteTransaction,
  deleteAllTransactions,
  BATCH_CHUNK_SIZE,
} from './transactionsApi';
export { fetchRules, createRule, updateRule, deleteRule, deleteAllRules } from './rulesApi';
