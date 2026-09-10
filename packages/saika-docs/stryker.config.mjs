// SPDX-License-Identifier: MIT
const config = {
  concurrency: 2,
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  reporters: ['clear-text', 'html', 'json'],
  mutate: ['src/shared/api/auth.ts'],
  thresholds: { break: 95, high: 100, low: 95 },
  vitest: { configFile: 'vitest.mutation.config.ts', related: false },
  ignorePatterns: [
    '.next',
    '.generated',
    'out',
    'dist',
    'reports',
    'coverage',
    'storybook-static',
    'playwright-report',
    'test-results',
  ],
  tempDirName: 'node_modules/.stryker-tmp',
  timeoutMS: 20000,
};

export default config;
