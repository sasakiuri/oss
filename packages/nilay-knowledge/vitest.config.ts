import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 4,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist', 'out'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/*.config.*'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
