// SPDX-License-Identifier: MIT
import config from '@sasakiuri/eslint-config';

export default [
  { ignores: ['playwright-report/**', 'test-results/**'] },
  ...config,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['**/main/**', 'node:*', 'electron', '**/vista-node'] }] },
  },
];
