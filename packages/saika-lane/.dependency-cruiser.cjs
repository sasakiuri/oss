/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'no-settings-policy-to-runtime',
      comment: 'Settings normalization and its consumer port depend only on shared IPC contracts.',
      severity: 'error',
      from: { path: '^src/main/modules/settings/application/(SettingsDocument|IAppSettingsStore)\\.ts$' },
      to: { path: '^src/', pathNot: '^src/shared/ipc/' },
    },
    {
      name: 'no-protocol-timer-to-runtime',
      comment: 'Serialized deadlines use injected clocks and queues without depending on a device session.',
      severity: 'error',
      from: { path: '^src/main/modules/connection/infra/usb/SerializedProtocolTimer\\.ts$' },
      to: {},
    },
    {
      name: 'no-migration-definitions-to-runtime',
      comment: 'Historical migrations are self-contained and must not change with current application code.',
      severity: 'error',
      from: { path: '^src/main/shared-infra/sqlite/migrations/([0-9]{3}_[^/]+|SessionSchema|Migration)\\.ts$' },
      to: { path: '^src/', pathNot: '^src/main/shared-infra/sqlite/migrations/Migration\\.ts$' },
    },
    {
      name: 'no-feature-to-migration-internals',
      comment: 'Features consume repositories; schema upgrades belong to database initialization.',
      severity: 'error',
      from: { path: '^src/main/modules/' },
      to: { path: '^src/main/shared-infra/sqlite/migrations/' },
    },
    {
      name: 'no-command-processing-to-handlers',
      comment: 'Command receipt and deduplication must remain independent of competition handlers.',
      severity: 'error',
      from: {
        path: '^src/main/modules/mqtt/application/commands/(LaneCommandProcessor|CommandIdempotencyGuard)\\.ts$',
      },
      to: {
        path: '^src/main/modules/mqtt/application/commands/(BroadcastCommandHandler|PerLaneCommandHandler|LaneTier1CommandHandler)\\.ts$',
      },
    },
    {
      name: 'no-mqtt-application-to-adapters-or-registration',
      comment: 'MQTT application components depend on transport ports and application contracts.',
      severity: 'error',
      from: { path: '^src/main/modules/mqtt/application/' },
      to: { path: '^src/main/modules/mqtt/(infra/|mqtt\\.module\\.ts$)' },
    },
    {
      name: 'no-feature-to-bootstrap',
      comment: 'Feature modules may use CQRS tokens, but must not construct the application.',
      severity: 'error',
      from: { path: '^src/main/modules/' },
      to: {
        path: '^src/main/(composition/|startup/|window/|main\\.ts$)',
        pathNot: '^src/main/composition/tokens\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
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
