/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'contracts-stay-portable',
      comment: 'Main, preload and renderer import the contracts, so they depend only on Zod.',
      severity: 'error',
      from: { path: '^src/index\\.ts$' },
      to: { pathNot: '(^|/)node_modules/zod/' },
    },
    {
      name: 'preload-bridge-stays-portable',
      comment: 'The preload bridge receives ipcRenderer from the app and loads no Electron or Node code.',
      severity: 'error',
      from: { path: '^src/preload\\.ts$' },
      to: { pathNot: ['^src/index\\.ts$', '(^|/)node_modules/zod/'] },
    },
    {
      name: 'main-dependencies',
      comment: 'The main-process subpath uses only the contracts and Electron.',
      severity: 'error',
      from: { path: '^src/main\\.ts$' },
      to: { pathNot: '^src/index\\.ts$', dependencyTypesNot: ['core'] },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] },
    builtInModules: { add: ['electron'] },
  },
};
