// SPDX-License-Identifier: MIT
import config from '@sasakiuri/eslint-config';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';

export default [
  { ignores: ['playwright-report/**', 'test-results/**'] },
  ...config,
  vitest,
  { ...testingLibrary, files: ['tests/renderer/**/*.test.{ts,tsx}'] },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['**/main/**', 'node:*', 'electron', '**/vista-node'] }] },
  },
];
