/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended',
  forbidden: [
    {
      name: 'no-examination-view-to-services',
      comment: 'Examination forms submit typed commands; their workspace hook owns IPC and record state.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/target-examinations/(TargetExaminationsPanel|CaseDetail|CreateCaseForm|ExaminationEntryForms|LinkScopeForm)\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/)' },
    },
    {
      name: 'no-examination-state-to-views',
      comment: 'Queries, commands, contracts and presentation policies remain independent of views.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/target-examinations/(useTargetExaminationCases|examinationTypes|examinationPresentation)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-examination-policy-to-runtime',
      comment: 'Display policy and command types depend only on shared contracts.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/target-examinations/(examinationTypes|examinationPresentation)\\.ts$',
      },
      to: { path: '^src/', pathNot: '^src/shared/ipc/' },
    },
    {
      name: 'no-examination-form-to-workspace',
      comment: 'Case-owned forms cannot reach back into their parent workspace or its state hook.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/target-examinations/(CaseDetail|CreateCaseForm|ExaminationEntryForms|LinkScopeForm)\\.tsx$',
      },
      to: {
        path: '^src/renderer/presentation/features/target-examinations/(TargetExaminationsPanel\\.tsx|useTargetExaminationCases\\.ts)$',
      },
    },
    {
      name: 'no-competition-view-to-services',
      comment: 'Competition composition and display panels receive state and command callbacks from hooks.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/competition-control/(CompetitionControlScreen|LaneManagementPanel|LaneAttentionSignals|CompetitionRunPanel|CompetitionEvidencePanel)\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/domain/)' },
    },
    {
      name: 'no-feature-state-to-views',
      comment: 'State and command lifetimes cannot depend on the components that render them, including types.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/(competition-control/use[^/]+|range-interruptions/useRangeInterruptionCases)\\.ts$',
      },
      to: { path: '^src/renderer/presentation/features/.*\\.tsx$' },
    },
    {
      name: 'no-presentation-policy-to-runtime',
      comment: 'Planning, recovery checks and formatting remain independent of views, stores and IPC services.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/(competition-control/(assignmentPlanning|progressPlanning|phaseStartRequirements|competitionFormatting)|range-interruptions/(interruptionRecoveryState|interruptionFormatting))\\.ts$',
      },
      to: { path: '^src/renderer/(services/|events/|presentation/(hooks/|stores/))|^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-interruption-detail-to-panel',
      comment: 'Interruption forms and recovery helpers depend on local contracts instead of the parent panel.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/range-interruptions/',
        pathNot: '/(index\\.ts|RangeInterruptionsScreen\\.tsx)$',
      },
      to: { path: '^src/renderer/presentation/features/range-interruptions/RangeInterruptionsPanel\\.tsx$' },
    },
    {
      name: 'no-mqtt-collaborator-to-coordinator',
      comment: 'Focused MQTT components use consumer-owned ports, not the competition coordinator.',
      severity: 'error',
      from: {
        path: '^src/main/modules/mqtt/application/(DirectorMqttConnection|DirectorLaneReadiness|CompetitionExpiryScheduler|LaneHardwareMonitor|DirectorMqttReceiver|DirectorMqttState|MqttCommandDispatcher|DirectorCommandPort|QualificationRecoveryCommands|RangeInterruptionCommands|RangeSafetyCommands|createLaneCommandFailure)\\.ts$',
      },
      to: { path: '^src/main/modules/mqtt/application/DirectorMqttService\\.ts$' },
    },
    {
      name: 'no-mqtt-workflows-to-runtime-owners',
      comment: 'Command workflows use their ports; the coordinator owns queues, connection, state and dispatch.',
      severity: 'error',
      from: {
        path: '^src/main/modules/mqtt/application/(QualificationRecoveryCommands|RangeInterruptionCommands|RangeSafetyCommands)\\.ts$',
      },
      to: {
        path: '^src/main/shared-infra/operations/|^src/main/modules/mqtt/(domain/IMqttTransport|application/(DirectorMqttConnection|DirectorMqttState|DirectorLaneReadiness|MqttCommandDispatcher|CompetitionExpiryScheduler|LaneHardwareMonitor))\\.ts$',
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
      comment: 'Feature modules must not depend on application construction or startup.',
      severity: 'error',
      from: { path: '^src/main/modules/' },
      to: {
        path: '^src/main/(composition/|main\\.ts$)',
        dependencyTypesNot: ['type-only'],
      },
    },
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
  },
};
