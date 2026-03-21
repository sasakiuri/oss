/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    // === Process boundary rules (severity: error) ===
    {
      name: 'no-renderer-to-main',
      comment: 'renderer/ must not import from main/',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^src/main/' },
    },
    {
      name: 'no-main-to-renderer',
      comment: 'main/ must not import from renderer/',
      severity: 'error',
      from: { path: '^src/main/' },
      to: { path: '^src/renderer/' },
    },
    {
      name: 'no-preload-to-main',
      comment: 'preload/ must not import from main/',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/main/' },
    },
    {
      name: 'no-preload-to-renderer',
      comment: 'preload/ must not import from renderer/',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/renderer/' },
    },
    {
      name: 'no-shared-to-main',
      comment: 'shared/ must not import from main/',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/main/' },
    },
    {
      name: 'no-shared-to-renderer',
      comment: 'shared/ must not import from renderer/',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/renderer/' },
    },

    // === Clean Architecture layer rules (severity: error) ===
    {
      name: 'no-domain-to-infra',
      comment: 'domain/ layers must not import from infra/ within the same module',
      severity: 'error',
      from: { path: '^src/main/modules/[^/]+/domain/' },
      to: { path: '^src/main/modules/[^/]+/infra/' },
    },
    {
      name: 'no-domain-to-application',
      comment: 'domain/ must not import from application/ within the same module',
      severity: 'error',
      from: { path: '^src/main/modules/[^/]+/domain/' },
      to: { path: '^src/main/modules/[^/]+/application/' },
    },
    {
      name: 'no-application-to-infra',
      comment: 'application/ must not import from infra/ within the same module',
      severity: 'error',
      from: { path: '^src/main/modules/[^/]+/application/' },
      to: {
        path: '^src/main/modules/[^/]+/infra/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // === Override recommended no-circular to allow type-only cycles ===
    {
      name: 'no-circular',
      comment: 'Override recommended rule: allow type-only circular dependencies',
      severity: 'ignore',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-circular-runtime',
      comment: 'No circular dependencies (type-only imports are allowed)',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['type-only'] },
      },
    },

    // === Dev dependency rule (severity: error) ===
    {
      name: 'no-dev-deps-in-src',
      comment: 'src/ must not import from npm devDependencies',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'] },
    },

    // === Orphan rule (severity: warn) ===
    {
      name: 'no-orphans',
      comment: 'Warn on orphan files',
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
    builtInModules: {
      add: ['electron'],
    },
    cache: {
      strategy: 'metadata',
      compress: true,
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^src/main/modules/([^/]+)',
        theme: { graph: { rankdir: 'TD' } },
      },
      archi: {
        collapsePattern: '^(src/[^/]+|src/main/modules/[^/]+|src/renderer/[^/]+)',
      },
    },
  },
};
