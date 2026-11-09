// SPDX-License-Identifier: MIT
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: [
      'tests/unit/url-properties.test.ts',
      'tests/unit/auth-contract.test.ts',
      'tests/unit/api.test.ts',
      'tests/unit/config.test.ts',
    ],
  },
});
