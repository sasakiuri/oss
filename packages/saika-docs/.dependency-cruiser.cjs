// SPDX-License-Identifier: MIT
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'shared-is-independent',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(entities|features|app)/' },
    },
    {
      name: 'entities-do-not-import-features',
      severity: 'error',
      from: { path: '^src/entities/' },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'features-do-not-import-routes',
      severity: 'error',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
