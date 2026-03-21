// SPDX-License-Identifier: MIT
import { readFileSync } from 'fs';
import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

// Define path aliases as shared variables
const alias = {
  '@': resolve(__dirname, './src'),
};

// Read version from package.json
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };
const appVersion = JSON.stringify(pkg.version);

export default defineConfig({
  base: './', // Use relative paths for asset resolution in Electron
  plugins: [
    react(),
    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: 'stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: [
                'serialport',
                '@serialport/bindings-cpp',
                'node-gyp-build',
                'better-sqlite3',
                'bufferutil',
                'utf-8-validate',
              ],
            },
          },
          resolve: { alias },
        },
        onstart(args) {
          args.startup();
        },
      },
      preload: {
        input: 'src/preload/preload.ts',
        vite: {
          define: { __APP_VERSION__: appVersion },
          build: {
            outDir: 'dist/preload',
          },
          resolve: { alias },
        },
        onstart(args) {
          args.reload();
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias,
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        print: resolve(__dirname, 'print.html'),
      },
    },
  },
});
