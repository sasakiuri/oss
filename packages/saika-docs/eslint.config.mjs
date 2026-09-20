// SPDX-License-Identifier: MIT
import shared from '@sasakiuri/eslint-config';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';
import nextVitals from 'eslint-config-next/core-web-vitals';
import storybook from 'eslint-plugin-storybook';

const config = [
  {
    ignores: [
      '.generated/**',
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'reports/**',
      'storybook-static/**',
      'playwright-report/**',
      'test-results/**',
      '.lighthouseci/**',
      '.lighthouse.reports/**',
      'next-env.d.ts',
    ],
  },
  ...shared,
  vitest,
  { ...testingLibrary, files: ['tests/unit/**/*.test.{ts,tsx}'] },
  // The shared configuration owns the TypeScript plugin; Next.js can resolve another copy.
  ...nextVitals.map((config) => {
    if (!config.plugins?.['@typescript-eslint']) return config;
    const { '@typescript-eslint': _typescript, ...plugins } = config.plugins;
    return { ...config, plugins };
  }),
  ...storybook.configs['flat/recommended'],
  ...[
    ['shared', ['@/app/**', '@/features/**', '@/entities/**']],
    ['entities', ['@/app/**', '@/features/**']],
    ['features', ['@/app/**']],
  ].map(([layer, group]) => ({
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group, message: 'Dependencies must follow app → features → entities → shared.' }] },
      ],
    },
  })),
];

export default config;
