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
      'lib/generated/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...base,
  vitest,
  { ...testingLibrary, files: ['__tests__/unit/**/*.test.{ts,tsx}'] },
  // Share the TypeScript plugin even when Next.js resolves a separate copy.
  ...[...nextVitals, ...nextTs].map((config) => {
    if (!config.plugins?.['@typescript-eslint']) return config;
    const { '@typescript-eslint': _typescript, ...plugins } = config.plugins;
    return { ...config, plugins };
  }),
  {
    files: ['features/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '**/app/**'], message: 'Features and shared UI must not depend on route modules.' },
          ],
        },
      ],
    },
  },
  {
    files: ['features/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    ignores: ['features/**/server/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '**/app/**'], message: 'Features and shared UI must not depend on route modules.' },
            {
              group: [
                '@/lib/server/**',
                '@/lib/prisma',
                '@/lib/env',
                '@/lib/logging',
                '@/lib/logging/**',
                '@/lib/generated/**',
                '@/lib/security/sanitize-logging',
                '**/server/**',
              ],
              message: 'Keep server dependencies inside feature server adapters.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
