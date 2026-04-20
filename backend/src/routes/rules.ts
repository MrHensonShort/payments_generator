/**
 * src/routes/rules.ts
 *
 * Rules CRUD endpoints (P6-04 / CLA-73).
 *
 * GET    /api/v1/rules       – list all rules
 * POST   /api/v1/rules       – create a rule
 * PUT    /api/v1/rules/:id   – update a rule
 * DELETE /api/v1/rules/:id   – delete a rule
 *
 * Note: Rule.config is stored as a JSON string in SQLite (Prisma Json type
 * is not supported for SQLite). The config field is serialised on write and
 * deserialised on read so callers always receive/send a plain object.
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

interface RuleBody {
  id: string;
  type: 'recurring' | 'episode' | 'scatter';
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
}

interface RuleUpdate {
  name?: string;
  config?: Record<string, unknown>;
}

/** Deserialise config string → object for API responses. */
function deserialise(rule: {
  id: string;
  type: string;
  name: string;
  config: string;
  createdAt: string;
}) {
  return {
    ...rule,
    config: (() => {
      try {
        return JSON.parse(rule.config) as Record<string, unknown>;
      } catch {
        return {};
      }
    })(),
  };
}

export async function ruleRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/rules ────────────────────────────────────────────────────────

  fastify.get(
    '/api/v1/rules',
    {
      schema: {
        tags: ['rules'],
        summary: 'List all rules',
      },
    },
    async (_request, reply) => {
      const rules = await prisma.rule.findMany({ orderBy: { createdAt: 'asc' } });
      return reply.send({ data: rules.map(deserialise) });
    },
  );

  // ── POST /api/v1/rules ───────────────────────────────────────────────────────

  fastify.post<{ Body: RuleBody }>(
    '/api/v1/rules',
    {
      schema: {
        tags: ['rules'],
        summary: 'Create a new rule',
        body: {
          type: 'object',
          required: ['id', 'type', 'name', 'config', 'createdAt'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['recurring', 'episode', 'scatter'] },
            name: { type: 'string' },
            config: { type: 'object' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { config, ...rest } = request.body;
      const rule = await prisma.rule.create({
        data: { ...rest, config: JSON.stringify(config) },
      });
      return reply.status(201).send(deserialise(rule));
    },
  );

  // ── PUT /api/v1/rules/:id ────────────────────────────────────────────────────

  fastify.put<{ Params: { id: string }; Body: RuleUpdate }>(
    '/api/v1/rules/:id',
    {
      schema: {
        tags: ['rules'],
        summary: 'Update a rule',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            config: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await prisma.rule.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Rule ${id} not found.`,
        });
      }
      const { config, ...rest } = request.body;
      const updated = await prisma.rule.update({
        where: { id },
        data: {
          ...rest,
          ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
        },
      });
      return reply.send(deserialise(updated));
    },
  );

  // ── DELETE /api/v1/rules/:id ─────────────────────────────────────────────────

  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/rules/:id',
    {
      schema: {
        tags: ['rules'],
        summary: 'Delete a rule',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await prisma.rule.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Rule ${id} not found.`,
        });
      }
      await prisma.rule.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
