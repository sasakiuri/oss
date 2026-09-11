/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'protocol-dependencies',
      comment: 'Wire contracts may depend only on other contracts and Zod, never on application or runtime code.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/vista-node\\.ts$' },
      to: { pathNot: ['^src/', '(^|/)node_modules/zod/'] },
    },
    {
      name: 'node-transport-dependencies',
      comment: 'The explicit Node transport subpath uses only Node builtins and wire schemas.',
      severity: 'error',
      from: { path: '^src/vista-node\\.ts$' },
      to: { pathNot: '^src/Vista\\.ts$', dependencyTypesNot: ['core'] },
    },
    {
      name: 'wire-contracts-stay-portable',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/vista-node\\.ts$' },
      to: { path: '^src/vista-node\\.ts$' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] },
  },
};
