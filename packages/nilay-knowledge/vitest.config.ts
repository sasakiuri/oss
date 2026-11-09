import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';

import { createWebsiteVitestConfig } from '../repo-tooling/vitest.mjs';

const config = async () => {
  const shared = await createWebsiteVitestConfig(fileURLToPath(new URL('.', import.meta.url)), { react });
  return {
    ...shared,
    test: {
      ...shared.test,
      coverage: { ...shared.test.coverage, thresholds: { lines: 89, statements: 88, branches: 88, functions: 85 } },
    },
  };
};

export default config;
