import eslintConfig from '@sasakiuri/eslint-config';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';

export default [
  ...eslintConfig,
  vitest,
  { ...testingLibrary, files: ['tests/unit/renderer/**/*.test.{ts,tsx}'] },

  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: {
      'import/order': 'off',
      'import/no-duplicates': 'off',
      'import/newline-after-import': 'off',
    },
  },

  // Renderer access to main-process services goes through IPC.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/main/*', '@/main/**'],
              message: 'Renderer must not import from main process. Use @/shared/ or IPC contracts instead.',
            },
          ],
        },
      ],
    },
  },

  // Main-process modules use public module exports and cannot import renderer code.
  {
    files: ['src/main/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/renderer/*', '@/renderer/**'],
              message: 'Main process must not import from renderer.',
            },
            {
              group: ['@/main/modules/*/*', '@/main/modules/*/**'],
              message:
                'Import from module barrel export instead (e.g., @/main/modules/championship). Internal module files should not be accessed directly from outside the module.',
            },
          ],
        },
      ],
    },
  },

  // Shared code and preload use public module exports.
  {
    files: ['src/shared/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/main/modules/*/*', '@/main/modules/*/**'],
              message: 'Import from module barrel export instead (e.g., @/main/modules/championship).',
            },
          ],
        },
      ],
    },
  },
];
