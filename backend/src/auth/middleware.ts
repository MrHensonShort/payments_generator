/**
 * src/auth/middleware.ts
 *
 * Fastify preHandler hook that validates API key authentication (P6-03).
 *
 * Reads the key from the `Authorization: Bearer <key>` header.
 * Hashes it and looks up the hash in the `api_keys` table.
 * Rejects with 401 if:
 *   - the header is missing or malformed
 *   - no matching key is found
 *   - the key has been revoked (isActive === false)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { hashKey } from './apiKey.js';

/**
 * Fastify preHandler: enforce API key auth on the calling route.
 *
 * Attach to a route or a plugin scope via `preHandler`:
 * ```ts
 * fastify.addHook('preHandler', requireApiKey);
 * ```
 */
export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <api-key>',
    });
  }

  const rawKey = authHeader.slice('Bearer '.length).trim();
  if (!rawKey) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Empty API key.',
    });
  }

  const hash = hashKey(rawKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { isActive: true },
  });

  if (!apiKey || !apiKey.isActive) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or revoked API key.',
    });
  }
}
