/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'renderer-safe-root',
      comment:
        'Renderers import the root export: update state and error summaries depend only on each other and Zod, ' +
        'never on Electron, electron-updater, Node builtins or the main-process service.',
      severity: 'error',
      from: { path: '^src/(index|state|errorSummary)\\.ts$' },
      to: { pathNot: ['^src/(state|errorSummary)\\.ts$', '(^|/)node_modules/zod/'] },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] },
  },
};
