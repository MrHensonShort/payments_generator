/**
 * src/infrastructure/api/apiClient.ts
 *
 * Core HTTP client for the Payments Generator backend API (P6-05 / CLA-74).
 *
 * Reads the API key and base URL from localStorage on every call so that
 * settings changes are reflected immediately without a page reload.
 * Authentication uses the `Authorization: Bearer <key>` scheme expected by
 * backend/src/auth/middleware.ts.
 */

import { getApiKey, getApiUrl } from './apiKeyStorage';
import { ApiError } from './types';

/**
 * Generic API request helper.
 *
 * @param method - HTTP method ('GET', 'POST', 'PUT', 'DELETE').
 * @param path   - Path relative to the backend base URL (e.g. '/api/v1/rules').
 * @param body   - Optional JSON-serialisable request body.
 * @returns      Parsed JSON response body.
 * @throws       {ApiError} on network failure, 4xx, or 5xx responses.
 */
export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getApiUrl()}${path}`;
  const apiKey = getApiKey();

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch() throws on network-level errors (offline, CORS pre-flight failure, DNS)
    throw new ApiError(0, 'Netzwerkfehler: Server nicht erreichbar');
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      // ignore JSON parse error on error responses
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content – return undefined cast to T
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
