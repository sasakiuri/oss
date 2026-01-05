import base from '@acme/eslint-config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...nextVitals,
  ...nextTs,
  ...base,
];

export default eslintConfig;
