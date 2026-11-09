// SPDX-License-Identifier: MIT
export default {
  concurrency: 2,
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'coverage/mutation/index.html' },
  jsonReporter: { fileName: 'coverage/mutation/mutation.json' },
  mutate: ['src/UpdaterService.ts', 'src/errorSummary.ts', 'src/state.ts'],
  thresholds: { break: 95, high: 100, low: 95 },
  vitest: { configFile: 'vitest.config.ts', related: false },
  ignorePatterns: ['dist', 'reports', 'coverage'],
  tempDirName: 'node_modules/.stryker-tmp',
  timeoutMS: 20000,
};
