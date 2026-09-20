import base from '@sasakiuri/eslint-config';
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
  // Share the TypeScript plugin even when Next.js resolves a separate copy.
  ...[...nextVitals, ...nextTs].map((config) => {
    if (!config.plugins?.['@typescript-eslint']) return config;
    const { '@typescript-eslint': _typescript, ...plugins } = config.plugins;
    return { ...config, plugins };
  }),
];

export default eslintConfig;
