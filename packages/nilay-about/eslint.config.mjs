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
  { ...testingLibrary, files: ['__tests__/unit/**/*.test.{ts,tsx}'] },
  ...next,
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
                '@/lib/env',
                '@/lib/logging',
                '@/lib/logging/**',
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
  // Browser storage is reached only through the shared modules, which keep a backup restore apart from
  // the tools, keep the tools read-only while a cut-short restore waits, and are what the backup reads.
  // A tool that used localStorage or IndexedDB itself would be left out of all three.
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: [
      '__tests__/**',
      'public/**',
      '*.config.*',
      'lib/browser-storage.ts',
      'lib/indexed-db.ts',
      'lib/hunter-map-storage.ts',
      'lib/labs-restore-journal.ts',
      'app/(standalone)/labs/data/backup.ts',
      // The site's language setting, which is not Labs data and is never part of a backup.
      'store/language-store.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message:
            'Use browserStorage / readStoredText (lib/browser-storage.ts) or createIndexedDb (lib/indexed-db.ts).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          ['localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
            object,
            property,
            message:
              'Use browserStorage / readStoredText (lib/browser-storage.ts) or createIndexedDb (lib/indexed-db.ts).',
          })),
        ),
      ],
    },
  },
];

export default eslintConfig;
