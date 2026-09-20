import base from '@sasakiuri/eslint-config';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

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
  // Share the TypeScript plugin even when Next.js resolves a separate copy.
  ...[...nextVitals, ...nextTs].map((config) => {
    if (!config.plugins?.['@typescript-eslint']) return config;
    const { '@typescript-eslint': _typescript, ...plugins } = config.plugins;
    return { ...config, plugins };
  }),
];

export default eslintConfig;
