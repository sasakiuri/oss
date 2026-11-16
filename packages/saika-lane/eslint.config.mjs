// SPDX-License-Identifier: MIT
import eslintConfig from '@sasakiuri/eslint-config';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';

export default [
  ...eslintConfig,
  vitest,
  { ...testingLibrary, files: ['tests/unit/renderer/**/*.test.{ts,tsx}'] },
  // The IPC main helpers load Electron's app module, so only main-process code may import them.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@sasakiuri/saika-ipc/main',
              message: 'Only main-process code may import the IPC main helpers.',
            },
          ],
        },
      ],
    },
  },
];
