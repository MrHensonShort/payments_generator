/**
 * src/db.ts
 *
 * Prisma client singleton for the payments-backend.
 *
 * In tests, override DATABASE_URL with an in-memory SQLite URL:
 *   process.env.DATABASE_URL = 'file::memory:?cache=shared'
 * and call `prisma.$disconnect()` in afterAll.
 */

import { PrismaClient } from '@prisma/client';

// Singleton: reuse the same PrismaClient across module imports.
// In tests, each test file should either use a separate DB or reset state.
const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
