// SPDX-License-Identifier: MIT
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: { lines: 75, statements: 75, branches: 65, functions: 75 },
    },
  },
});
