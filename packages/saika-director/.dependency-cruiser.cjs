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
      name: 'no-championship-screen-to-commands-runtime',
      comment: 'The championship screen gets its commands from useChampionshipScreenCommands.',
      severity: 'error',
      from: { path: '^src/renderer/presentation/features/championship/ChampionshipScreen\\.tsx$' },
      to: { path: '^src/renderer/(services/|presentation/stores/ui/)' },
    },
    {
      name: 'no-championship-results-state-to-views',
      comment: 'Screen commands and result queries do not depend on the components that render them.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/(features/championship/useChampionshipScreenCommands|hooks/useResults)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-mixed-team-table-to-runtime',
      comment: 'The Mixed Team Final table renders the results it receives.',
      severity: 'error',
      from: { path: '^src/renderer/presentation/features/team-results/MixedTeamFinalResultsTable\\.tsx$' },
      to: { path: '^src/renderer/(services/|presentation/(hooks/|stores/))' },
    },
    {
      name: 'no-books-lists-view-to-services',
      comment: 'Start List, Results Book and network settings views receive state and commands from their hooks.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/((start-lists/(StartListPanel|StartListVersionDetail|StartListSelectField)|results-books/(ResultsBookPanel|OfficialAppointmentsForm|RecordClaimCreateForm|RecordClaimReview|RecordClaimActions|ResultsBookVersionsForm|ResultsBookField))|settings/(SettingsScreen|NetworkSettingsPanel))\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/)' },
    },
    {
      name: 'no-books-lists-state-to-views',
      comment: 'Queries, commands and the CSV and label policies remain independent of the views that render them.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/((start-lists/(useStartListVersions|startListCsv)|results-books/(useResultsBookWorkspace|resultsBookPresentation))|settings/useSettingsScreen)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-books-lists-policy-to-runtime',
      comment: 'The Start List CSV and the Results Book labels depend only on shared contracts.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/(start-lists/startListCsv|results-books/resultsBookPresentation)\\.ts$',
      },
      to: { path: '^src/', pathNot: '^src/shared/ipc/' },
    },
    {
      name: 'no-books-lists-form-to-panel',
      comment: 'Start List and Results Book forms cannot reach back into their parent panel.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/(start-lists/(StartListVersionDetail|StartListSelectField)|results-books/(OfficialAppointmentsForm|RecordClaimCreateForm|RecordClaimReview|RecordClaimActions|ResultsBookVersionsForm|ResultsBookField))\\.tsx$',
      },
      to: {
        path: '^src/renderer/presentation/features/(start-lists/StartListPanel|results-books/ResultsBookPanel)\\.tsx$',
      },
    },
    {
      name: 'no-malfunction-view-to-services',
      comment: 'Malfunction case views submit typed commands; their workspace hook owns IPC and case state.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/qualification-malfunctions/(QualificationMalfunctionPanel|CreateMalfunctionForm|MalfunctionDetail|MalfunctionEntryForm|MalfunctionFields)\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/)' },
    },
    {
      name: 'no-malfunction-state-to-views',
      comment: 'Queries, commands and malfunction rules remain independent of views.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/qualification-malfunctions/(useQualificationMalfunctionCases|malfunctionRules|malfunctionLanes)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-malfunction-rules-to-runtime',
      comment: 'Remedy, entry-type and Lane eligibility rules depend only on shared contracts.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/qualification-malfunctions/(malfunctionRules|malfunctionLanes)\\.ts$',
      },
      to: { path: '^src/', pathNot: '^src/shared/ipc/' },
    },
    {
      name: 'no-malfunction-form-to-workspace',
      comment: 'Case-owned forms cannot reach back into their parent panel or its state hook.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/qualification-malfunctions/(CreateMalfunctionForm|MalfunctionDetail|MalfunctionEntryForm|MalfunctionFields)\\.tsx$',
      },
      to: {
        path: '^src/renderer/presentation/features/qualification-malfunctions/(QualificationMalfunctionPanel\\.tsx|useQualificationMalfunctionCases\\.ts)$',
      },
    },
    {
      name: 'no-final-recovery-view-to-services',
      comment: 'Final recovery case views submit typed commands; their workspace hook owns IPC and case state.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-recoveries/(FinalRecoveryPanel|CreateRecoveryForm|RecoveryDetail)\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/)' },
    },
    {
      name: 'no-final-recovery-state-to-views',
      comment: 'Queries, commands and recovery rules remain independent of views.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-recoveries/(useFinalRecoveryCases|finalRecoveryRules|finalRecoveryCommands)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-final-recovery-rules-to-runtime',
      comment: 'Recovery gating rules and command types depend only on shared contracts.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-recoveries/(finalRecoveryRules|finalRecoveryCommands)\\.ts$',
      },
      to: { path: '^src/', pathNot: '^src/shared/ipc/' },
    },
    {
      name: 'no-final-recovery-form-to-workspace',
      comment: 'Case-owned forms cannot reach back into their parent panel or its state hook.',
      severity: 'error',
      from: { path: '^src/renderer/presentation/features/final-recoveries/(CreateRecoveryForm|RecoveryDetail)\\.tsx$' },
      to: {
        path: '^src/renderer/presentation/features/final-recoveries/(FinalRecoveryPanel\\.tsx|useFinalRecoveryCases\\.ts)$',
      },
    },
    {
      name: 'no-incident-report-view-to-services',
      comment: 'Incident report views call the workspace hook, which owns IPC and report state.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/incident-reports/(IncidentReportsView|IncidentReportCreateForm|IncidentReportDetail|IncidentReportRoleOptions)\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/)' },
    },
    {
      name: 'no-incident-report-state-to-views',
      comment: 'The incident report workspace hook remains independent of views.',
      severity: 'error',
      from: { path: '^src/renderer/presentation/features/incident-reports/useIncidentReportWorkspace\\.ts$' },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-incident-report-form-to-workspace',
      comment: 'Report forms cannot reach back into the view or its state hook.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/incident-reports/(IncidentReportCreateForm|IncidentReportDetail|IncidentReportRoleOptions)\\.tsx$',
      },
      to: {
        path: '^src/renderer/presentation/features/incident-reports/(IncidentReportsView\\.tsx|useIncidentReportWorkspace\\.ts)$',
      },
    },
    {
      name: 'no-final-operation-view-to-services',
      comment: 'Final command runner views receive run state and commands from useFinalOperationRun.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-operations/(FinalOperationPanel|CreateRunForm|CurrentStepCard|ExecutionLaneSelection|ShootOffBranchSelection|ShootOffResolutionCard|TextField)\\.tsx$',
      },
      to: { path: '^src/renderer/(services/|presentation/stores/)' },
    },
    {
      name: 'no-final-operation-state-to-views',
      comment: 'The run hook and the Final rules remain independent of views.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-operations/(useFinalOperationRun|finalOperationRules|finalOperationOutcome)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-final-operation-policy-to-runtime',
      comment: 'Shoot-off outcome parsing and step rules depend only on shared contracts and pure helpers.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-operations/(finalOperationRules|finalOperationOutcome)\\.ts$',
      },
      to: { path: '^src/renderer/(services/|events/|presentation/(hooks/|stores/))|^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-final-operation-detail-to-panel',
      comment: 'Final command runner sub-views do not reach back into the panel.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/final-operations/',
        pathNot: '/(index\\.ts|FinalOperationPanel\\.tsx)$',
      },
      to: { path: '^src/renderer/presentation/features/final-operations/FinalOperationPanel\\.tsx$' },
    },
    {
      name: 'no-athlete-sanction-view-to-services',
      comment: 'Sanction forms submit typed commands; the workspace hook owns IPC and the workspace.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/athlete-sanctions/(AthleteSanctionsPanel|CreateIdentityForm|IdentityCard|SanctionForm|ActiveSanctions|Field)\\.tsx$',
      },
      to: { path: '^src/renderer/services/' },
    },
    {
      name: 'no-athlete-sanction-state-to-views',
      comment: 'The workspace hook, command types and sanction rules remain independent of views.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/athlete-sanctions/(useAthleteSanctionsWorkspace|athleteSanctionTypes|athleteSanctionRules|sanctionFormClasses)\\.ts$',
      },
      to: { path: '^src/renderer/.*\\.tsx$' },
    },
    {
      name: 'no-athlete-sanction-policy-to-runtime',
      comment: 'Sanction rules and command types depend only on shared contracts.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/athlete-sanctions/(athleteSanctionTypes|athleteSanctionRules)\\.ts$',
      },
      to: {
        path: '^src/',
        pathNot: '^src/shared/ipc/|^src/renderer/presentation/features/athlete-sanctions/athleteSanctionTypes\\.ts$',
      },
    },
    {
      name: 'no-athlete-sanction-form-to-workspace',
      comment: 'Identity and sanction forms cannot reach back into the panel or its workspace hook.',
      severity: 'error',
      from: {
        path: '^src/renderer/presentation/features/athlete-sanctions/(CreateIdentityForm|IdentityCard|SanctionForm|ActiveSanctions)\\.tsx$',
      },
      to: {
        path: '^src/renderer/presentation/features/athlete-sanctions/(AthleteSanctionsPanel\\.tsx|useAthleteSanctionsWorkspace\\.ts)$',
      },
    },
    {
      name: 'no-mqtt-collaborator-to-coordinator',
      comment: 'Focused MQTT components use consumer-owned ports, not the competition coordinator.',
      severity: 'error',
      from: {
        path: '^src/main/modules/mqtt/application/(DirectorMqttConnection|DirectorLaneReadiness|CompetitionExpiryScheduler|LaneHardwareMonitor|DirectorMqttReceiver|DirectorMqttState|MqttCommandDispatcher|DirectorCommandPort|QualificationRecoveryCommands|RangeInterruptionCommands|RangeSafetyCommands|ReserveLaneTransferCommands|TimedTargetCommands|FinalCompetitionCommands|createLaneCommandFailure|operationalProfileTargets|MqttObservationRecorder|mqttEventForwarding)\\.ts$',
      },
      to: { path: '^src/main/modules/mqtt/application/DirectorMqttService\\.ts$' },
    },
    {
      name: 'no-mqtt-workflows-to-runtime-owners',
      comment: 'Command workflows use their ports; the coordinator owns queues, connection, state and dispatch.',
      severity: 'error',
      from: {
        path: '^src/main/modules/mqtt/application/(QualificationRecoveryCommands|RangeInterruptionCommands|RangeSafetyCommands|ReserveLaneTransferCommands|TimedTargetCommands|FinalCompetitionCommands)\\.ts$',
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
      name: 'no-renderer-runtime-to-contract-barrel',
      comment:
        'The barrel is for types. A schema value imported through it would bundle every contract into the renderer; import the value from its contract file.',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^src/shared/ipc/contracts/index\\.ts$', dependencyTypesNot: ['type-only'] },
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
