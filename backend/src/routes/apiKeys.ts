/**
 * src/routes/apiKeys.ts
 *
 * API-key management endpoints (P6-03 / CLA-72).
 *
 * POST   /api/v1/users/:userId/api-keys          – create a new API key
 * GET    /api/v1/users/:userId/api-keys          – list API keys (no raw key)
 * POST   /api/v1/api-keys/:keyId/rotate          – rotate: revoke old, issue new
 * DELETE /api/v1/api-keys/:keyId                 – revoke key
 *
 * The raw key is returned ONLY on creation and rotation (never stored).
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { generateRawKey, hashKey, keyPrefix } from '../auth/apiKey.js';

export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/users/:userId/api-keys ─────────────────────────────────────

  fastify.post<{ Params: { userId: string } }>(
    '/api/v1/users/:userId/api-keys',
    {
      schema: {
        tags: ['api-keys'],
        summary: 'Create a new API key for a user',
        params: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          required: ['userId'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              rawKey: { type: 'string', description: 'Store securely – shown only once' },
              keyPrefix: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const raw = generateRawKey();
      const apiKey = await prisma.apiKey.create({
        data: {
          userId,
          keyHash: hashKey(raw),
          keyPrefix: keyPrefix(raw),
        },
      });
      return reply.status(201).send({
        id: apiKey.id,
        rawKey: raw,
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt.toISOString(),
      });
    },
  );

  // ── GET /api/v1/users/:userId/api-keys ──────────────────────────────────────

  fastify.get<{ Params: { userId: string } }>(
    '/api/v1/users/:userId/api-keys',
    {
      schema: {
        tags: ['api-keys'],
        summary: 'List API keys for a user (no raw keys)',
        params: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          required: ['userId'],
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const keys = await prisma.apiKey.findMany({
        where: { userId },
        select: { id: true, keyPrefix: true, isActive: true, createdAt: true, revokedAt: true },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ data: keys });
    },
  );

  // ── POST /api/v1/api-keys/:keyId/rotate ─────────────────────────────────────

  fastify.post<{ Params: { keyId: string } }>(
    '/api/v1/api-keys/:keyId/rotate',
    {
      schema: {
        tags: ['api-keys'],
        summary: 'Rotate an API key (revoke old, issue new)',
        params: {
          type: 'object',
          properties: { keyId: { type: 'string' } },
          required: ['keyId'],
        },
      },
    },
    async (request, reply) => {
      const { keyId } = request.params;

      // Find the old key
      const old = await prisma.apiKey.findUnique({ where: { id: keyId } });
      if (!old || !old.isActive) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'API key not found or already revoked.',
        });
      }

      const raw = generateRawKey();
      const now = new Date();

      // Create new key and revoke old in a transaction
      const newKey = await prisma.$transaction(async (tx) => {
        const created = await tx.apiKey.create({
          data: {
            userId: old.userId,
            keyHash: hashKey(raw),
            keyPrefix: keyPrefix(raw),
          },
        });
        await tx.apiKey.update({
          where: { id: keyId },
          data: { isActive: false, revokedAt: now, rotatedToId: created.id },
        });
        return created;
      });

      return reply.status(201).send({
        id: newKey.id,
        rawKey: raw,
        keyPrefix: newKey.keyPrefix,
        createdAt: newKey.createdAt.toISOString(),
        rotatedFromId: keyId,
      });
    },
  );

  // ── DELETE /api/v1/api-keys/:keyId ──────────────────────────────────────────

  fastify.delete<{ Params: { keyId: string } }>(
    '/api/v1/api-keys/:keyId',
    {
      schema: {
        tags: ['api-keys'],
        summary: 'Revoke an API key (deactivate without deleting)',
        params: {
          type: 'object',
          properties: { keyId: { type: 'string' } },
          required: ['keyId'],
        },
      },
    },
    async (request, reply) => {
      const { keyId } = request.params;
      const existing = await prisma.apiKey.findUnique({ where: { id: keyId } });
      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'API key not found.',
        });
      }
      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false, revokedAt: new Date() },
      });
      return reply.status(204).send();
    },
  );
}
