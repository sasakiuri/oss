// SPDX-License-Identifier: MIT
export default {
  concurrency: 2,
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'coverage/mutation/index.html' },
  jsonReporter: { fileName: 'coverage/mutation/mutation.json' },
  // Scoring boundaries and effective rule selection affect competition results.
  mutate: ['src/ShotResultProjection.ts', 'src/RulePackRegistry.ts'],
  thresholds: { break: 95, high: 100, low: 95 },
  vitest: { configFile: 'vitest.mutation.config.ts', related: false },
  ignorePatterns: ['dist', 'reports', 'coverage'],
  tempDirName: 'node_modules/.stryker-tmp',
  timeoutMS: 20000,
};
