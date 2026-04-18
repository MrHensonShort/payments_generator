/**
 * src/app.ts
 *
 * Fastify application factory (P6-01 / CLA-70).
 *
 * Creates and configures the Fastify instance:
 *   - OpenAPI documentation via @fastify/swagger + @fastify/swagger-ui
 *   - Rate limiting via @fastify/rate-limit (default: 100 req/min)
 *   - CORS via @fastify/cors (configured from CORS_ORIGIN env var)
 *   - Unified error format: { error, message, statusCode }
 *   - Route registration for transactions, rules, export, and api-keys
 */

import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { apiKeyRoutes } from './routes/apiKeys.js';
import { exportRoutes } from './routes/export.js';
import { ruleRoutes } from './routes/rules.js';
import { transactionRoutes } from './routes/transactions.js';

export interface AppOptions {
  /** Rate-limit max requests per window (default: 100). */
  rateLimitMax?: number;
  /** Rate-limit time window in ms (default: 60 000). */
  rateLimitWindow?: number;
  /** Comma-separated CORS origins or '*' (default: '*'). */
  corsOrigin?: string;
  /** Log level (default: 'info'). */
  logLevel?: string;
  /** Body size limit in bytes (default: 32 MiB to support 10k-transaction batches). */
  bodyLimit?: number;
}

/**
 * Build and configure the Fastify app.
 *
 * Exported separately from `server.ts` so that integration tests can import
 * the factory and start the server without binding to a port.
 */
export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const {
    rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 100),
    rateLimitWindow = Number(process.env.RATE_LIMIT_WINDOW ?? 60_000),
    corsOrigin = process.env.CORS_ORIGIN ?? '*',
    logLevel = process.env.LOG_LEVEL ?? 'info',
    // 32 MiB covers a 10 000-transaction batch (each ~200 bytes ≈ 2 MiB)
    bodyLimit = 32 * 1024 * 1024,
  } = options;

  const app = fastify({
    logger: {
      level: logLevel,
      ...(process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    bodyLimit,
  });

  // ── OpenAPI ──────────────────────────────────────────────────────────────────

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Payments Generator API',
        description: 'REST API for importing, querying, and exporting payment transactions',
        version: '1.0.0',
      },
      tags: [
        { name: 'transactions', description: 'Transaction management' },
        { name: 'rules', description: 'Rule management' },
        { name: 'export', description: 'Data export' },
        { name: 'api-keys', description: 'API key lifecycle' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'API key (256-bit hex)',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────────

  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: rateLimitWindow,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}.`,
    }),
  });

  // ── CORS ─────────────────────────────────────────────────────────────────────

  const parsedOrigin: string | string[] =
    corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim());

  await app.register(cors, {
    origin: parsedOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: corsOrigin !== '*',
  });

  // ── Error handler ─────────────────────────────────────────────────────────────

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    void reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message: error.message,
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route not found.',
    });
  });

  // ── Health check ──────────────────────────────────────────────────────────────

  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Health check',
        response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
      },
    },
    async (_request, reply) => reply.send({ status: 'ok' }),
  );

  // ── Routes ────────────────────────────────────────────────────────────────────

  await app.register(transactionRoutes);
  await app.register(ruleRoutes);
  await app.register(exportRoutes);
  await app.register(apiKeyRoutes);

  return app;
}
