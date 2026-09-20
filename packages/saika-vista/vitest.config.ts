// SPDX-License-Identifier: MIT
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: { lines: 85, statements: 80, branches: 75, functions: 75 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/renderer/**', 'tests/load.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'load',
          environment: 'node',
          include: ['tests/load.test.ts'],
          sequence: { groupOrder: 1 },
          maxWorkers: 1,
        },
      },
    ],
  },
});
