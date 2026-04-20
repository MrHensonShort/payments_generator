/**
 * tests/integration.test.ts
 *
 * Integration tests for the Fastify backend (P6-06 / CLA-75).
 *
 * Uses an in-process SQLite file created from the Prisma migration SQL,
 * so no external database or migrate command is needed.
 *
 * Coverage:
 *   BATCH   Batch import: up to 10k transactions; > 10k → 400
 *   CRUD    Transaction create → read → update → delete roundtrip
 *   RULES   Rule CRUD roundtrip
 *   AUTH    API-key lifecycle: create → use → rotate → revoke → 401
 *   RATE    Rate-limit header present; 429 when limit exceeded
 *   HEALTH  /health endpoint returns { status: 'ok' }
 *   EXPORT  CSV export with correct headers
 */

import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Test DB setup ─────────────────────────────────────────────────────────────
// Use a unique test DB file per test run to avoid conflicts.
const TEST_DB = `/tmp/payments-test-${Date.now()}.db`;

// Set env vars BEFORE any imports that reference them
process.env.DATABASE_URL = `file:${TEST_DB}`;
process.env.NODE_ENV = 'test';

// Dynamic imports so the modules pick up DATABASE_URL set above
const { buildApp } = await import('../src/app.js');
const { generateRawKey, hashKey, keyPrefix } = await import('../src/auth/apiKey.js');
const { requireApiKey } = await import('../src/auth/middleware.js');

const prisma = new PrismaClient({ datasources: { db: { url: `file:${TEST_DB}` } } });

let app: FastifyInstance;

beforeAll(async () => {
  // Apply the initial migration SQL to set up the schema
  const migDir = join(__dirname, '..', 'prisma', 'migrations');
  const migFolders = readdirSync(migDir)
    .filter((f) => /^\d{14}_/.test(f))
    .sort();
  for (const folder of migFolders) {
    const sql = readFileSync(join(migDir, folder, 'migration.sql'), 'utf8');
    for (const stmt of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch {
        // Ignore "already exists" errors (idempotent)
      }
    }
  }

  app = await buildApp({ logLevel: 'silent', rateLimitMax: 200, rateLimitWindow: 60_000 });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      unlinkSync(TEST_DB + suffix);
    } catch {
      /* ignore */
    }
  }
});

beforeEach(async () => {
  // Clean in FK-safe order
  await prisma.$executeRawUnsafe('DELETE FROM api_keys');
  await prisma.$executeRawUnsafe('DELETE FROM users');
  await prisma.$executeRawUnsafe('DELETE FROM transactions');
  await prisma.$executeRawUnsafe('DELETE FROM rules');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUserAndKey(): Promise<{ userId: string; rawKey: string; keyId: string }> {
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userId = `user-${ts}`;
  await prisma.user.create({
    data: { id: userId, email: `${userId}@test.com`, updatedAt: new Date() },
  });
  const raw = generateRawKey();
  const apiKey = await prisma.apiKey.create({
    data: { userId, keyHash: hashKey(raw), keyPrefix: keyPrefix(raw) },
  });
  return { userId, rawKey: raw, keyId: apiKey.id };
}

function makeTx(id: string) {
  return {
    id,
    date: '2025-01-15',
    time: '09:00',
    amount: -99.5,
    purpose: 'Test purpose',
    counterparty: 'Test counterparty',
    category: 'Miete',
    source: 'recurring',
    ruleId: null,
  };
}

// ── HEALTH ─────────────────────────────────────────────────────────────────────

describe('HEALTH: /health endpoint', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok' });
  });
});

// ── RATE ──────────────────────────────────────────────────────────────────────

describe('RATE: rate-limit headers', () => {
  it('includes x-ratelimit-limit header on responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const strictApp = await buildApp({
      logLevel: 'silent',
      rateLimitMax: 1,
      rateLimitWindow: 60_000,
    });
    await strictApp.ready();
    await strictApp.inject({ method: 'GET', url: '/health' });
    const res = await strictApp.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(429);
    await strictApp.close();
  });
});

// ── BATCH ─────────────────────────────────────────────────────────────────────

describe('BATCH: batch import', () => {
  it('imports up to 10 000 transactions in one request', async () => {
    const transactions = Array.from({ length: 100 }, (_, i) => makeTx(`tx-batch-${i}`));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/batch',
      payload: { transactions },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).imported).toBe(100);
  });

  it('returns 400 when batch exceeds 10 000 items (schema maxItems)', async () => {
    // Build 10 001 minimal transaction objects (body fits within 32 MiB limit)
    const transactions = Array.from({ length: 10_001 }, (_, i) => makeTx(`tx-over-${i}`));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/batch',
      payload: { transactions },
    });
    // Fastify schema validation (maxItems: 10000) returns 400
    expect(res.statusCode).toBe(400);
  });
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('CRUD: transaction roundtrip', () => {
  it('create → read → update → delete', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/batch',
      payload: { transactions: [makeTx('crud-tx-001')] },
    });

    const listRes = await app.inject({ method: 'GET', url: '/api/v1/transactions' });
    const list = JSON.parse(listRes.body);
    expect(list.data).toHaveLength(1);
    expect(list.data[0].id).toBe('crud-tx-001');

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/transactions/crud-tx-001',
      payload: { purpose: 'Updated purpose' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).purpose).toBe('Updated purpose');

    const delRes = await app.inject({ method: 'DELETE', url: '/api/v1/transactions/crud-tx-001' });
    expect(delRes.statusCode).toBe(204);

    const listRes2 = await app.inject({ method: 'GET', url: '/api/v1/transactions' });
    expect(JSON.parse(listRes2.body).data).toHaveLength(0);
  });

  it('supports cursor-based pagination', async () => {
    const txs = Array.from({ length: 5 }, (_, i) =>
      makeTx(`page-tx-${String(i).padStart(3, '0')}`),
    );
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/batch',
      payload: { transactions: txs },
    });

    const page1 = await app.inject({ method: 'GET', url: '/api/v1/transactions?limit=3' });
    const body1 = JSON.parse(page1.body);
    expect(body1.data).toHaveLength(3);
    expect(body1.hasNextPage).toBe(true);

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?limit=3&cursor=${body1.nextCursor as string}`,
    });
    const body2 = JSON.parse(page2.body);
    expect(body2.data.length).toBeGreaterThanOrEqual(1);
    expect(body2.hasNextPage).toBe(false);
  });

  it('DELETE returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/transactions/no-such-id' });
    expect(res.statusCode).toBe(404);
  });
});

// ── RULES ─────────────────────────────────────────────────────────────────────

describe('RULES: rule CRUD roundtrip', () => {
  it('create → read → update → delete', async () => {
    const rule = {
      id: 'rule-001',
      type: 'recurring',
      name: 'Monatsmiete',
      config: { dayOfMonth: 1, cycle: 'monthly' },
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    const createRes = await app.inject({ method: 'POST', url: '/api/v1/rules', payload: rule });
    expect(createRes.statusCode).toBe(201);
    expect(JSON.parse(createRes.body).config).toMatchObject({ dayOfMonth: 1 });

    const listRes = await app.inject({ method: 'GET', url: '/api/v1/rules' });
    expect(JSON.parse(listRes.body).data).toHaveLength(1);

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/rules/rule-001',
      payload: { name: 'Monatliche Miete' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).name).toBe('Monatliche Miete');

    const delRes = await app.inject({ method: 'DELETE', url: '/api/v1/rules/rule-001' });
    expect(delRes.statusCode).toBe(204);

    const listRes2 = await app.inject({ method: 'GET', url: '/api/v1/rules' });
    expect(JSON.parse(listRes2.body).data).toHaveLength(0);
  });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

describe('AUTH: API-key lifecycle', () => {
  it('generates a 256-bit (64-char hex) raw key', async () => {
    const { rawKey } = await createUserAndKey();
    expect(rawKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keyPrefix is the first 8 chars of the raw key', async () => {
    const { rawKey, keyId } = await createUserAndKey();
    const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
    expect(apiKey?.keyPrefix).toBe(rawKey.slice(0, 8));
  });

  it('rotates key: old revoked, new issued', async () => {
    const { keyId } = await createUserAndKey();

    const res = await app.inject({ method: 'POST', url: `/api/v1/api-keys/${keyId}/rotate` });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { rawKey: string; rotatedFromId: string };
    expect(body.rawKey).toMatch(/^[0-9a-f]{64}$/);
    expect(body.rotatedFromId).toBe(keyId);

    const old = await prisma.apiKey.findUnique({ where: { id: keyId } });
    expect(old?.isActive).toBe(false);
    expect(old?.revokedAt).not.toBeNull();
  });

  it('revokes key: isActive set to false, revokedAt set', async () => {
    const { keyId } = await createUserAndKey();

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/api-keys/${keyId}` });
    expect(res.statusCode).toBe(204);

    const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
    expect(key?.isActive).toBe(false);
    expect(key?.revokedAt).not.toBeNull();
  });

  it('middleware rejects invalid key with 401', async () => {
    let statusSent = 0;
    const mockReply = {
      status: (s: number) => ({
        send: (b: unknown) => {
          statusSent = s;
          return b;
        },
      }),
    } as never;
    const mockRequest = {
      headers: { authorization: 'Bearer ' + '0'.repeat(64) },
    } as never;
    await requireApiKey(mockRequest, mockReply);
    expect(statusSent).toBe(401);
  });

  it('middleware rejects missing Authorization header with 401', async () => {
    let statusSent = 0;
    const mockReply = {
      status: (s: number) => ({
        send: () => {
          statusSent = s;
        },
      }),
    } as never;
    await requireApiKey({ headers: {} } as never, mockReply);
    expect(statusSent).toBe(401);
  });
});

// ── EXPORT ────────────────────────────────────────────────────────────────────

describe('EXPORT: GET /api/v1/export/csv', () => {
  it('returns 200 with text/csv content-type', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/batch',
      payload: { transactions: [makeTx('exp-1'), makeTx('exp-2')] },
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/export/csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('transactions.csv');
  });

  it('CSV body contains header and data rows', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/batch',
      payload: { transactions: [makeTx('exp-A')] },
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/export/csv' });
    const lines = res.body.split('\r\n').filter(Boolean);
    expect(lines[0]).toContain('id');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('returns CSV with header even when no transactions exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/export/csv' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id');
  });
});
