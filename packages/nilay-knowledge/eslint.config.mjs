import base from '@sasakiuri/eslint-config';
import next from '@sasakiuri/eslint-config/next';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...base,
  vitest,
  { ...testingLibrary, files: ['__tests__/components/**/*.test.{ts,tsx}'] },
  ...next,
];

export default eslintConfig;
