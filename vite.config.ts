import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Simple bundle-stats plugin – writes dist/bundle-stats.json after each build.
// Uses writeBundle (post-write hook) so dist/ is guaranteed to exist.
function bundleStatsPlugin(): Plugin {
  return {
    name: 'bundle-stats',
    writeBundle(options, bundle) {
      const outDir = options.dir ?? 'dist';
      const stats: Array<{ file: string; size: number; type: string }> = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        const size =
          chunk.type === 'chunk'
            ? Buffer.byteLength(chunk.code, 'utf8')
            : chunk.type === 'asset' && typeof chunk.source === 'string'
              ? Buffer.byteLength(chunk.source, 'utf8')
              : chunk.type === 'asset' && chunk.source instanceof Uint8Array
                ? chunk.source.byteLength
                : 0;
        stats.push({ file: fileName, size, type: chunk.type });
      }
      stats.sort((a, b) => b.size - a.size);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, 'bundle-stats.json'), JSON.stringify(stats, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), bundleStatsPlugin()],
  base: '/payments_generator/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Raise warning threshold — initial gzip is well under 500 kB requirement
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Radix UI primitives (tree-shaken per import but grouped for caching)
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          // Heavy data / table libraries
          'vendor-data': ['@tanstack/react-table', '@tanstack/react-virtual', 'dexie', 'papaparse'],
          // Utility libraries
          'vendor-utils': [
            'clsx',
            'class-variance-authority',
            'tailwind-merge',
            'date-fns',
            'zustand',
            'comlink',
            'lucide-react',
          ],
        },
      },
    },
  },
});
