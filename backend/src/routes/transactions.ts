/**
 * src/routes/transactions.ts
 *
 * Transaction endpoints (P6-04 / CLA-73).
 *
 * POST   /api/v1/transactions/batch   – bulk import (≤ 10 000 records)
 * GET    /api/v1/transactions         – list (cursor-based pagination, filterable)
 * PUT    /api/v1/transactions/:id     – update a single transaction
 * DELETE /api/v1/transactions/:id     – delete a single transaction
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

/** Max transactions allowed in a single batch import. */
const BATCH_MAX = 10_000;

interface TransactionBody {
  id: string;
  date: string;
  time: string;
  amount: number;
  purpose: string;
  counterparty: string;
  category: string;
  source: string;
  ruleId?: string;
}

interface TransactionUpdate {
  date?: string;
  time?: string;
  amount?: number;
  purpose?: string;
  counterparty?: string;
  category?: string;
  source?: string;
  ruleId?: string | null;
}

export async function transactionRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/transactions/batch ─────────────────────────────────────────

  fastify.post<{ Body: { transactions: TransactionBody[] } }>(
    '/api/v1/transactions/batch',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Batch import up to 10 000 transactions',
        body: {
          type: 'object',
          required: ['transactions'],
          properties: {
            transactions: {
              type: 'array',
              maxItems: BATCH_MAX,
              items: {
                type: 'object',
                required: [
                  'id',
                  'date',
                  'time',
                  'amount',
                  'purpose',
                  'counterparty',
                  'category',
                  'source',
                ],
                properties: {
                  id: { type: 'string' },
                  date: { type: 'string' },
                  time: { type: 'string' },
                  amount: { type: 'number' },
                  purpose: { type: 'string' },
                  counterparty: { type: 'string' },
                  category: { type: 'string' },
                  source: { type: 'string', enum: ['recurring', 'episode', 'scatter', 'manual'] },
                  ruleId: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              imported: { type: 'number' },
            },
          },
          400: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { transactions } = request.body;

      if (transactions.length > BATCH_MAX) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Batch size ${transactions.length} exceeds maximum of ${BATCH_MAX}.`,
        });
      }

      const result = await prisma.transaction.createMany({
        data: transactions,
      });

      return reply.status(201).send({ imported: result.count });
    },
  );

  // ── GET /api/v1/transactions ─────────────────────────────────────────────────

  fastify.get<{
    Querystring: {
      cursor?: string;
      limit?: number;
      category?: string;
      source?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    '/api/v1/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'List transactions (cursor-based pagination)',
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string', description: 'Cursor id for pagination' },
            limit: { type: 'number', default: 50, minimum: 1, maximum: 500 },
            category: { type: 'string' },
            source: { type: 'string', enum: ['recurring', 'episode', 'scatter', 'manual'] },
            dateFrom: { type: 'string', description: 'YYYY-MM-DD' },
            dateTo: { type: 'string', description: 'YYYY-MM-DD' },
          },
        },
      },
    },
    async (request, reply) => {
      const { cursor, limit = 50, category, source, dateFrom, dateTo } = request.query;

      const where: Record<string, unknown> = {};
      if (category) where.category = category;
      if (source) where.source = source;
      if (dateFrom || dateTo) {
        where.date = {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        };
      }

      const transactions = await prisma.transaction.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
      });

      const hasNextPage = transactions.length > limit;
      const data = hasNextPage ? transactions.slice(0, limit) : transactions;
      const nextCursor = hasNextPage ? data[data.length - 1].id : null;

      return reply.send({ data, nextCursor, hasNextPage });
    },
  );

  // ── PUT /api/v1/transactions/:id ─────────────────────────────────────────────

  fastify.put<{ Params: { id: string }; Body: TransactionUpdate }>(
    '/api/v1/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Update a single transaction',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            time: { type: 'string' },
            amount: { type: 'number' },
            purpose: { type: 'string' },
            counterparty: { type: 'string' },
            category: { type: 'string' },
            source: { type: 'string' },
            ruleId: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await prisma.transaction.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Transaction ${id} not found.`,
        });
      }
      const updated = await prisma.transaction.update({
        where: { id },
        data: request.body,
      });
      return reply.send(updated);
    },
  );

  // ── DELETE /api/v1/transactions/:id ─────────────────────────────────────────

  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Delete a single transaction',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await prisma.transaction.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Transaction ${id} not found.`,
        });
      }
      await prisma.transaction.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
