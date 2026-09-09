/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'protocol-dependencies',
      comment: 'Wire contracts may depend only on other contracts and Zod, never on application or runtime code.',
      severity: 'error',
      from: { path: '^src/' },
      to: { pathNot: ['^src/', '(^|/)node_modules/zod/'] },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] },
  },
};
