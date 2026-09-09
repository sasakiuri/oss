/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'rules-dependencies',
      comment: 'Rule definitions and policies remain application-neutral, with no runtime dependencies.',
      severity: 'error',
      from: { path: '^src/' },
      to: { pathNot: '^src/' },
    },
    {
      name: 'no-validation-to-catalog',
      comment: 'Validation accepts definitions; it must not load a particular edition or the public catalog.',
      severity: 'error',
      from: { path: '^src/validation/' },
      to: { path: '^src/(issf-[^/]+/|index\\.ts$|RulePackRegistry\\.ts$)' },
    },
    {
      name: 'no-validator-to-definition-factory',
      comment: 'Capability validators consume type contracts without recursively defining Rule Packs.',
      severity: 'error',
      from: { path: '^src/validation/', pathNot: '/defineRulePack\\.ts$' },
      to: {
        path: '^src/(RulePack|validation/defineRulePack)\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-primitives-to-capabilities',
      comment: 'Scalar validation must not depend on a capability or Rule Pack.',
      severity: 'error',
      from: { path: '^src/validation/primitives\\.ts$' },
      to: { path: '^src/' },
    },
    { name: 'no-circular', severity: 'ignore', from: {}, to: { circular: true } },
    {
      name: 'no-circular-runtime',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] },
  },
};
