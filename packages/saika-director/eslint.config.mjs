import eslintConfig from '@sasakiuri/eslint-config';

export default [
  ...eslintConfig,

  // === TypeScript file support ===
  // Keep the imported code focused on boundary violations while its existing
  // import ordering is normalized incrementally.
  // The imported package keeps its existing grouping for now; this applies to
  // tests and build configuration as well as application source.
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: {
      'import/order': 'off',
      'import/no-duplicates': 'off',
      'import/newline-after-import': 'off',
    },
  },

  // === Module Boundary Rules ===

  // 1. Renderer → Main process boundary
  //    Renderer must NOT import from main process.
  //    Communication goes through IPC contracts in @/shared/ipc/.
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

  // 2. Main process → Renderer boundary + Module internal imports
  //    Main must NOT import from renderer.
  //    Cross-module imports must go through barrel exports (e.g., @/main/modules/championship).
  //
  //    Circular dependency resolved in Phase 8-A:
  //    - RankingService moved to results module with IRankable interface
  //    - results imports IUnifiedLaneControlRepository type from lane-control (DI only, no runtime circular)
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

  // 3. Shared/Preload must NOT import internal module files
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
