// SPDX-License-Identifier: MIT
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Preserve the established boundary checks while measuring all runtime code.
const verifiedBoundaries = [
  'src/entities/document/{links,code-meta,parse}.ts',
  'src/features/search/search-index.@(ts)',
  'src/shared/api/{http,auth,query,browser-client}.ts',
  'src/shared/api/server/{client,response,rate-limit}.ts',
  'src/shared/config/{env,security,query}.ts',
  'src/shared/lib/{date,search-params,structured-data}.ts',
  'src/shared/telemetry/redact.@(ts)',
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/shared/api/generated.ts', 'src/**/*.stories.{ts,tsx}'],
      thresholds: {
        lines: 40,
        statements: 39,
        branches: 42,
        functions: 29,
        [`{${verifiedBoundaries.join(',')}}`]: { lines: 85, statements: 85, branches: 80, functions: 90 },
      },
    },
  },
});
