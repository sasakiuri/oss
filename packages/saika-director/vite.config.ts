import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

const alias = {
  '@': resolve(__dirname, './src'),
};

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };
const appVersion = JSON.stringify(pkg.version);

export default defineConfig({
  base: './',
  publicDir: 'assets',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['node-gyp-build', 'better-sqlite3', 'bufferutil', 'utf-8-validate'],
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
    port: 5174,
  },
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        board: resolve(__dirname, 'board.html'),
      },
    },
  },
});
