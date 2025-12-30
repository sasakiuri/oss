import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import base from '@acme/eslint-config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// read /.gitignore
const gitignoreContent = readFileSync(resolve(__dirname, '../../.gitignore'), 'utf-8');

// .gitignore to array
const gitignorePatterns = gitignoreContent
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => line.trim());

const eslintConfig = [
  {
    ignores: [...gitignorePatterns, '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...nextVitals,
  ...nextTs,
  ...base,
];

export default eslintConfig;
