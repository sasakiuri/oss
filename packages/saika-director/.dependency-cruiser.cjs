/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'no-renderer-to-main',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^src/main/' },
    },
    {
      name: 'no-main-to-renderer',
      severity: 'error',
      from: { path: '^src/main/' },
      to: { path: '^src/renderer/' },
    },
    {
      name: 'no-preload-to-main',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/main/' },
    },
    {
      name: 'no-preload-to-renderer',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/renderer/' },
    },
    {
      name: 'no-shared-to-process-specific-code',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(main|renderer)/' },
    },
    {
      name: 'no-domain-to-infra',
      severity: 'error',
      from: { path: '^src/main/modules/[^/]+/domain/' },
      to: { path: '^src/main/modules/[^/]+/infra/' },
    },
    {
      name: 'no-domain-to-application',
      severity: 'error',
      from: { path: '^src/main/modules/[^/]+/domain/' },
      to: { path: '^src/main/modules/[^/]+/application/' },
    },
    {
      name: 'no-application-to-infra',
      severity: 'error',
      from: { path: '^src/main/modules/[^/]+/application/' },
      to: { path: '^src/main/modules/[^/]+/infra/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-circular',
      severity: 'ignore',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-circular-runtime',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'no-dev-deps-in-src',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.(test|spec)\\.tsx?$', '\\.d\\.ts$', '\\.css$', '\\.module\\.css$'],
      },
      to: {},
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    includeOnly: { path: '^src/' },
    exclude: { path: ['\\.(test|spec)\\.ts$', '\\.d\\.ts$'] },
    moduleSystems: ['es6'],
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      mainFields: ['module', 'main', 'types'],
    },
    builtInModules: { add: ['electron'] },
    cache: { strategy: 'content', compress: true },
  },
};
