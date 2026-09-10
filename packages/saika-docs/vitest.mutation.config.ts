// SPDX-License-Identifier: MIT
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/unit/url-properties.test.ts', 'tests/unit/auth-contract.test.ts'] },
});
