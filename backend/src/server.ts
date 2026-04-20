/**
 * src/server.ts
 *
 * Entry point for the Fastify backend server (P6-01 / CLA-70).
 *
 * Start with:   npm run dev
 * Production:   npm run build && npm start
 */

import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening at http://${HOST}:${PORT}`);
    console.log(`OpenAPI docs at   http://${HOST}:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  const app = await buildApp();
  await app.close();
  process.exit(0);
});

void main();
