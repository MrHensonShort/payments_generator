/**
 * src/routes/export.ts
 *
 * CSV export endpoint (P6-04 / CLA-73).
 *
 * GET /api/v1/export/csv
 *   Streams all transactions as a CSV download.
 *   Accepts the same filter query params as GET /api/v1/transactions.
 */

import type { FastifyInstance } from 'fastify';
import Papa from 'papaparse';
import { prisma } from '../db.js';

const CSV_COLUMNS = [
  'id',
  'date',
  'time',
  'amount',
  'purpose',
  'counterparty',
  'category',
  'source',
  'ruleId',
] as const;

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: {
      category?: string;
      source?: string;
      dateFrom?: string;
      dateTo?: string;
      delimiter?: string;
      bom?: string;
      filename?: string;
    };
  }>(
    '/api/v1/export/csv',
    {
      schema: {
        tags: ['export'],
        summary: 'Export all (or filtered) transactions as CSV',
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            source: { type: 'string' },
            dateFrom: { type: 'string' },
            dateTo: { type: 'string' },
            delimiter: {
              type: 'string',
              enum: [',', ';', 'tab'],
              default: ',',
              description: 'Field delimiter. Use "tab" for tab-separated.',
            },
            bom: { type: 'string', enum: ['true', 'false'], default: 'false' },
            filename: { type: 'string', default: 'transactions.csv' },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        category,
        source,
        dateFrom,
        dateTo,
        delimiter: delimParam = ',',
        bom = 'false',
        filename = 'transactions.csv',
      } = request.query;

      const delimiter = delimParam === 'tab' ? '\t' : (delimParam as ',' | ';');

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
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          date: true,
          time: true,
          amount: true,
          purpose: true,
          counterparty: true,
          category: true,
          source: true,
          ruleId: true,
        },
      });

      // Map to row objects with ruleId defaulted to empty string
      const rows = transactions.map((tx) => ({
        ...tx,
        ruleId: tx.ruleId ?? '',
      }));

      // Papa.unparse returns '' for empty arrays even with header:true,
      // so we build the header line manually for the empty case.
      const csv =
        rows.length > 0
          ? Papa.unparse(rows, {
              delimiter,
              columns: [...CSV_COLUMNS],
              header: true,
              newline: '\r\n',
            })
          : CSV_COLUMNS.join(delimiter);

      const content = bom === 'true' ? '\uFEFF' + csv : csv;

      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      void reply.header('Content-Type', 'text/csv;charset=utf-8');
      void reply.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
      return reply.send(content);
    },
  );
}
