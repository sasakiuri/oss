// SPDX-License-Identifier: MIT
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: { entry: 'src/main/main.ts', vite: { build: { outDir: 'dist/main' } } },
      preload: { input: 'src/preload/preload.ts', vite: { build: { outDir: 'dist/preload' } } },
    }),
  ],
  server: { host: 'localhost', port: 5176 },
  build: { outDir: 'dist/renderer', rollupOptions: { input: resolve(__dirname, 'index.html') } },
});
