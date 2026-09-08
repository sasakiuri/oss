/**
 * createContainer.ts
 *
 * Application dependency factory.
 *
 * Centralizes all dependency construction in the composition root.
 */

import { join } from 'path';

import { ISSF_2026_RULE_PACKS, RulePackRegistry } from '@sasakiuri/saika-rules';
import { app } from 'electron';

import { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { allMigrations } from '@/main/infrastructure/database/migrations';
import { ConsoleForwarder } from '@/main/infrastructure/logging/ConsoleForwarder';
import { DebugLogStore } from '@/main/infrastructure/logging/Logger';
import { WindowManager } from '@/main/infrastructure/window/WindowManager';
import { adjudicationCasesModule } from '@/main/modules/adjudication-cases';
import {
  AthleteSanctionParticipantEligibilityReader,
  AthleteSanctionResultClassificationSource,
  AthleteSanctionService,
  athleteSanctionsModule,
  ChampionshipSanctionScoringDecisionAdmissionPolicy,
  ManualAttestationSanctionAuthorizationResolver,
  SqliteAthleteEntryReferenceSource,
  SqliteAthleteSanctionRepository,
} from '@/main/modules/athlete-sanctions';
import { BackupCaptureReadinessService } from '@/main/modules/backup-capture-readiness/BackupCaptureReadinessService';
import { SqliteBackupCaptureReadinessSettingsRepository } from '@/main/modules/backup-capture-readiness/SqliteBackupCaptureReadinessSettingsRepository';
import { boardModule } from '@/main/modules/board';
import { championshipModule, SqliteEventRepository, SqliteParticipantRepository } from '@/main/modules/championship';
import { competitionAnnouncementsModule } from '@/main/modules/competition-announcements';
import { eliminationPlanningModule } from '@/main/modules/elimination-planning';
import { equipmentRegistryModule } from '@/main/modules/equipment-registry';
import { ElectronEstBackupFeedSelector } from '@/main/modules/est-backup-capture/ElectronEstBackupFeedSelector';
import { EstBackupCaptureService } from '@/main/modules/est-backup-capture/EstBackupCaptureService';
import { EstBackupParserReferences } from '@/main/modules/est-backup-capture/EstBackupParserReferences';
import { SqliteEstBackupCapturePlanRepository } from '@/main/modules/est-backup-capture/SqliteEstBackupCapturePlanRepository';
import { EstBackupSourceService, SqliteEstBackupSourceRepository } from '@/main/modules/est-backup-sources';
import {
  CanonicalCsvEstBackupRecordParser,
  CanonicalJsonEstBackupRecordParser,
  ElectronEstBackupRecordFileGateway,
  EstBackupRecordImportService,
  EstBackupRecordParserRegistry,
  estBackupVerificationModule,
  EstBackupVerificationService,
  EstBackupResultCheckService,
  FinalEstBackupSubjectSource,
  SqliteEstBackupVerificationRepository,
} from '@/main/modules/est-backup-verification';
import {
  EstInspectionStartService,
  SqliteEstInspectionStartSettingsRepository,
  SqliteEstChampionshipInspectionRepository,
  estChampionshipInspectionsModule,
} from '@/main/modules/est-championship-inspections';
import { estComplaintsModule } from '@/main/modules/est-complaints';
import {
  ElectronEvidenceFileTransfer,
  EvidenceFileArchiveSource,
  EvidenceFileService,
  evidenceFilesModule,
  NodeEvidenceFileStore,
  SqliteEvidenceFileRepository,
  TargetEvidenceFileSubjectSource,
} from '@/main/modules/evidence-files';
import { finalControlModule } from '@/main/modules/final-control';
import {
  FinalOperationService,
  finalOperationsModule,
  SqliteFinalOperationRepository,
} from '@/main/modules/final-operations';
import {
  finalPlacementReviewModule,
  SqliteFinalPlacementReviewRepository,
} from '@/main/modules/final-placement-review';
import {
  FinalRecoveryPublicationBlocker,
  SqliteFinalRecoveryEventScope,
  finalRecoveriesModule,
  SqliteFinalRecoveryRepository,
} from '@/main/modules/final-recoveries';
import { finalRecoveryFiringModule, SqliteFinalFiringRepository } from '@/main/modules/final-recovery-firing';
import {
  IncidentReportPublicationBlocker,
  incidentReportsModule,
  SqliteRangeIncidentReportRepository,
} from '@/main/modules/incident-reports';
import {
  irregularShotCasesModule,
  IrregularShotPublicationBlocker,
  SqliteIrregularShotCaseRepository,
} from '@/main/modules/irregular-shot-cases';
import { laneControlModule, LaneTimerService, SqliteLaneControlRepository } from '@/main/modules/lane-control';
import {
  MalfunctionQualificationScoreOverlaySource,
  MalfunctionScoreApplicationService,
  malfunctionScoreApplicationsModule,
  ResultMalfunctionScoreTargetSource,
  SqliteMalfunctionScoreApplicationRepository,
} from '@/main/modules/malfunction-score-applications';
import { mixedTeamFinalControlModule } from '@/main/modules/mixed-team-final-control';
import { mixedTeamTimeoutsModule } from '@/main/modules/mixed-team-timeouts';
import {
  mqttModule,
  SqliteCompetitionShotJournal,
  SqliteFiringWindowJournal,
  SqliteShotObservationEvidenceJournal,
} from '@/main/modules/mqtt';
import {
  observationReviewsModule,
  ObservationReviewService,
  SqliteObservationReviewRepository,
  StoredReviewSubjects,
  AppliedReviewCorrections,
  ObservationReviewPublicationBlocker,
} from '@/main/modules/observation-reviews';
import { OfficialSigningPolicy } from '@/main/modules/official-signing';
import {
  CompetitionEvidenceBundleBuilder,
  ElectronArchiveFileGateway,
  OperationalArchiveService,
  operationalArchivesModule,
  SqliteCompetitionEvidenceSource,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives';
import { booleanOperationalSetting } from '@/main/modules/operational-profiles';
import {
  OperatorAccessService,
  SqliteOperatorAccessStore,
  directorOperatorPermission,
  registerOperatorAccess,
  SessionSanctionAuthorizationResolver,
} from '@/main/modules/operator-access';
import {
  postCompetitionEquipmentControlModule,
  EquipmentControlPublicationBlocker,
  StoredEquipmentControlPublicationSource,
  SqlitePostCompetitionEquipmentCheckRepository,
} from '@/main/modules/post-competition-equipment-control';
import { productionOperationsModule } from '@/main/modules/production-operations';
import {
  protestsModule,
  ProtestPublicationBlocker,
  SqliteProtestEventScope,
  SqliteProtestRepository,
} from '@/main/modules/protests';
import {
  PublicationReviewPolicyService,
  PolicyBoundVerificationSource,
  SqlitePublicationReviewPolicyRepository,
  registerPublicationReviewPolicies,
} from '@/main/modules/publication-review-policies';
import {
  QualificationMalfunctionPublicationBlocker,
  qualificationMalfunctionsModule,
  SqliteMalfunctionScoreSheetRepository,
  SqliteQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';
import {
  InterruptionCompetitionDataGuard,
  rangeInterruptionsModule,
  SqliteRangeInterruptionRepository,
} from '@/main/modules/range-interruptions';
import { relayAthleteLifecycleModule } from '@/main/modules/relay-athlete-lifecycle';
import {
  relayReadinessModule,
  RelayReadinessService,
  SqliteRelayReadinessRepository,
  SqliteRelayStartSettingsRepository,
} from '@/main/modules/relay-readiness';
import {
  reserveLaneTransfersModule,
  ReserveTransferDataGuard,
  SqliteReserveTransferRepository,
} from '@/main/modules/reserve-lane-transfers';
import {
  OptionalResultPublicationBlocker,
  FinalResultDeclarationService,
  GuardedResultPublicationReadiness,
  resultPublicationModule,
  RulePackResultPublicationPolicyResolver,
  SqliteFinalResultDeclarationRepository,
  SqliteResultPublicationRepository,
  VerifiedResultPublicationReadiness,
} from '@/main/modules/result-publication';
import {
  FinalResultVerificationSource,
  QualificationResultVerificationSource,
  resultVerificationModule,
  ResultVerificationService,
  ResultVerificationSourceRegistry,
  SqliteResultVerificationRepository,
} from '@/main/modules/result-verification';
import {
  FinalResultsReader,
  QualificationResultsReader,
  resultsModule,
  ScoringDecisionTargetResolver,
  SqliteFinalResultRepository,
  SqliteResultRepository,
} from '@/main/modules/results';
import {
  ElectronResultsBookDocumentExporter,
  QualificationTeamRecordCandidateSource,
  ResultsBookService,
  resultsBooksModule,
  ResultWorkflowOfficialRevisionSource,
  SqliteResultsBookRepository,
  SqliteResultsBookSource,
  VerifiedResultsBookResultSnapshotSource,
} from '@/main/modules/results-books';
import {
  ExaminationScoreCorrectionCaseSource,
  CompositeScoreCorrectionCaseSource,
  FinalFiringScoreCorrectionCaseSource,
  ScoreCorrectionService,
  scoreCorrectionsModule,
  SqliteScoreCorrectionRepository,
  StoredScoreCorrectionTargetSource,
} from '@/main/modules/score-corrections';
import { scoringDecisionsModule, SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { shootoffModule } from '@/main/modules/shootoff';
import { squaddingModule } from '@/main/modules/squadding';
import { startListsModule } from '@/main/modules/start-lists';
import {
  EvidenceHoldCompetitionDataGuard,
  SqliteTargetExaminationRepository,
  targetExaminationsModule,
} from '@/main/modules/target-examinations';
import {
  CompetitionTypeTeamTieBreakPolicyResolver,
  SqliteMixedTeamFinalResultRepository,
  teamResultsModule,
  TeamResultsService,
} from '@/main/modules/team-results';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import {
  CommandLoggingMiddleware,
  QueryLoggingMiddleware,
} from '@/main/shared-infra/cqrs/middleware/LoggingMiddleware';
import { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { PhaseChanged, TimerExpired, TimerTick } from '@/main/shared-infra/events/coreEvents';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import type { EventForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';
import { CompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import { CompositeCompetitionDataGuard } from '@/main/shared-infra/operations/CompositeCompetitionDataGuard';
import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { registerBuiltinCompetitionTypes } from '@/shared/competitionTypes/registerBuiltinCompetitionTypes';
import { eventsContract } from '@/shared/ipc/contracts';
import { backupCaptureReadinessContract } from '@/shared/ipc/contracts/backupCaptureReadiness.contract';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('createApp');

// Static module list (Vite/Electron safe — no dynamic import)
const modules = [
  observationReviewsModule,
  malfunctionScoreApplicationsModule,
  scoreCorrectionsModule,
  evidenceFilesModule,
  championshipModule,
  athleteSanctionsModule,
  laneControlModule,
  scoringDecisionsModule,
  resultsModule,
  shootoffModule,
  boardModule,
  competitionAnnouncementsModule,
  targetExaminationsModule,
  estComplaintsModule,
  rangeInterruptionsModule,
  relayReadinessModule,
  relayAthleteLifecycleModule,
  estChampionshipInspectionsModule,
  postCompetitionEquipmentControlModule,
  equipmentRegistryModule,
  eliminationPlanningModule,
  teamResultsModule,
  protestsModule,
  estBackupVerificationModule,
  finalControlModule,
  adjudicationCasesModule,
  irregularShotCasesModule,
  operationalArchivesModule,
  resultsBooksModule,
  finalOperationsModule,
  finalRecoveriesModule,
  qualificationMalfunctionsModule,
  startListsModule,
  mixedTeamFinalControlModule,
  squaddingModule,
  productionOperationsModule,
  mixedTeamTimeoutsModule,
  mqttModule,
  reserveLaneTransfersModule,
  finalRecoveryFiringModule,
  resultVerificationModule,
  resultPublicationModule,
  incidentReportsModule,
  finalPlacementReviewModule,
];

/**
 * Services exposed to main.ts.
 */
export interface AppServices {
  readonly windowManager: WindowManager;
  readonly domainEventForwarder: DomainEventForwarder;
  readonly lifecycle: AppLifecycle;
  readonly laneTimerService: LaneTimerService;
  readonly databaseManager: DatabaseManager;
  readonly appConfigService: AppConfigService;
}

/** Prevents duplicate side effects from double initialization. */
let initialized = false;

/**
 * Constructs the application.
 *
 * This function is not idempotent and cannot be called twice.
 *
 * @param preloadPath Absolute path to the preload script.
 * @returns AppServices instance.
 * @throws When called more than once.
 */
export function createApp(preloadPath: string): AppServices {
  if (initialized) {
    const msg =
      'createApp() has already been called. Double initialization is not allowed because it causes duplicate side effects (console hooks, IPC handlers, event listeners).';
    logger.logError(msg, new Error(msg));
    throw new Error(msg);
  }
  initialized = true;

  // === Core Infrastructure ===
  const eventBus = new TypedEventBus();

  // Logging
  const debugLogStore = new DebugLogStore();
  const consoleForwarder = new ConsoleForwarder(eventBus);
  consoleForwarder.start();

  // Database
  const dbPath = join(app.getPath('userData'), 'saika.db');
  const databaseManager = new DatabaseManager(dbPath);
  const database = databaseManager.getDatabase();

  // Repositories
  const appConfigService = new AppConfigService(database);
  const laneControlRepository = new SqliteLaneControlRepository(database);
  const resultRepository = new SqliteResultRepository(database);
  const finalResultRepository = new SqliteFinalResultRepository(database);
  const mixedTeamFinalResultRepository = new SqliteMixedTeamFinalResultRepository(database);
  const participantRepository = new SqliteParticipantRepository(database);
  const scoringDecisionRepository = new SqliteScoringDecisionRepository(database);
  const competitionShotJournal = new SqliteCompetitionShotJournal(database);
  const firingWindowJournal = new SqliteFiringWindowJournal(database);
  const shotObservationEvidenceJournal = new SqliteShotObservationEvidenceJournal(database);
  const resultVerificationRepository = new SqliteResultVerificationRepository(database);
  const rangeIncidentReportRepository = new SqliteRangeIncidentReportRepository(database);
  const targetExaminationRepository = new SqliteTargetExaminationRepository(database);
  const rangeInterruptionRepository = new SqliteRangeInterruptionRepository(database);
  const competitionDataGuard = new CompositeCompetitionDataGuard([
    new ReserveTransferDataGuard(new SqliteReserveTransferRepository(database)),
    new EvidenceHoldCompetitionDataGuard(targetExaminationRepository),
    new InterruptionCompetitionDataGuard(rangeInterruptionRepository),
  ]);
  const finalPlacementReviewRepository = new SqliteFinalPlacementReviewRepository(database);
  const resultPublicationRepository = new SqliteResultPublicationRepository(database);
  const finalResultDeclarationRepository = new SqliteFinalResultDeclarationRepository(database);
  const irregularShotCaseRepository = new SqliteIrregularShotCaseRepository(database);
  const athleteSanctionRepository = new SqliteAthleteSanctionRepository(database);
  const athleteEntryReferenceSource = new SqliteAthleteEntryReferenceSource(database);
  const athleteSanctionService = new AthleteSanctionService(athleteSanctionRepository, athleteEntryReferenceSource);
  const sanctionResultClassificationSource = new AthleteSanctionResultClassificationSource(
    athleteSanctionRepository,
    athleteEntryReferenceSource,
  );
  const participantEligibilityReader = new AthleteSanctionParticipantEligibilityReader(
    athleteSanctionRepository,
    athleteEntryReferenceSource,
  );
  const operatorAccessStore = new SqliteOperatorAccessStore(database);
  const operatorAccessService = new OperatorAccessService(operatorAccessStore, directorOperatorPermission);
  const officialSigningPolicy = new OfficialSigningPolicy({
    currentActor: () => {
      const actor = operatorAccessService.currentActor();
      return actor ? { id: actor.id, name: actor.name, roles: actor.officialRoles } : null;
    },
    authenticationRequired: () => operatorAccessStore.enabled(),
    findActiveAccount: (id) => operatorAccessService.signingAccounts().find((actor) => actor.id === id) ?? null,
  });
  const policyEvents = new SqliteEventRepository(database, competitionTypeRegistry);
  const publicationReviewPolicies = new PublicationReviewPolicyService(
    new SqlitePublicationReviewPolicyRepository(database),
    () => ({
      requireObservationReviews: appConfigService.get('resultPublication.requireObservationReviews'),
      requireIncidentReports: appConfigService.get('resultPublication.requireIncidentReports'),
      requireFinalRecoveriesComplete: appConfigService.get('resultPublication.requireFinalRecoveriesComplete'),
      requireProtestCasesComplete: appConfigService.get('resultPublication.requireProtestCasesComplete'),
      requireEquipmentChecksComplete: appConfigService.get('resultPublication.requireEquipmentChecksComplete'),
    }),
    (eventId, scope) => {
      const event = policyEvents.findById(eventId);
      if (!event || event.round.value !== (scope === 'FINAL' ? 'Final' : 'Qualification')) return false;
      return (
        !resultPublicationRepository.findByEvent(eventId, scope).some((entry) => entry.type === 'OFFICIAL_PUBLISHED') &&
        (scope !== 'FINAL' || finalResultDeclarationRepository.findByEvent(eventId) === null)
      );
    },
    officialSigningPolicy,
  );
  const sanctionAuthorizationResolver = new SessionSanctionAuthorizationResolver(
    () => operatorAccessService.currentActor(),
    () => operatorAccessStore.enabled(),
    new ManualAttestationSanctionAuthorizationResolver(),
  );
  const scoringDecisionAdmissionPolicy = new ChampionshipSanctionScoringDecisionAdmissionPolicy();
  const evidenceFileStore = new NodeEvidenceFileStore(join(app.getPath('userData'), 'evidence-files'));
  const evidenceFileRepository = new SqliteEvidenceFileRepository(database);
  const evidenceFileService = new EvidenceFileService(
    evidenceFileRepository,
    evidenceFileStore,
    new ElectronEvidenceFileTransfer(),
    new TargetEvidenceFileSubjectSource(targetExaminationRepository),
  );
  const archiveFileGateway = new ElectronArchiveFileGateway();
  const operationalArchiveService = new OperationalArchiveService(
    new SqliteCompetitionEvidenceSource(database),
    new CompetitionEvidenceBundleBuilder(app.getVersion()),
    archiveFileGateway,
    new SqliteDatabaseBackupGateway(database, dbPath, app.getPath('userData'), allMigrations.at(-1)?.version ?? 0),
    undefined,
    new EvidenceFileArchiveSource(evidenceFileRepository, evidenceFileStore),
  );
  // Competition Type Registry
  registerBuiltinCompetitionTypes();
  const rulePackRegistry = new RulePackRegistry(ISSF_2026_RULE_PACKS);
  const finalOperationService = new FinalOperationService(
    new SqliteFinalOperationRepository(database),
    competitionTypeRegistry,
    rulePackRegistry,
  );

  // Window Manager
  const windowManager = new WindowManager(preloadPath);

  // CQRS
  const commandBus = new CommandBus();
  commandBus.use(new CommandLoggingMiddleware());
  const queryBus = new QueryBus();
  queryBus.use(new QueryLoggingMiddleware());

  const malfunctionScoreApplicationRepository = new SqliteMalfunctionScoreApplicationRepository(database);
  const malfunctionScoreCases = new SqliteQualificationMalfunctionRepository(database);
  const malfunctionScoreApplicationService = new MalfunctionScoreApplicationService(
    malfunctionScoreCases,
    new SqliteMalfunctionScoreSheetRepository(database),
    malfunctionScoreApplicationRepository,
    new ResultMalfunctionScoreTargetSource(
      resultRepository,
      new SqliteEventRepository(database, competitionTypeRegistry),
      competitionTypeRegistry,
    ),
  );
  const qualificationOverlays = new MalfunctionQualificationScoreOverlaySource(
    malfunctionScoreApplicationRepository,
    malfunctionScoreCases,
  );
  const scoreCorrectionService = new ScoreCorrectionService(
    new SqliteScoreCorrectionRepository(database),
    new StoredScoreCorrectionTargetSource(
      resultRepository,
      finalResultRepository,
      new SqliteEventRepository(database, competitionTypeRegistry),
      competitionTypeRegistry,
      qualificationOverlays,
    ),
    new CompositeScoreCorrectionCaseSource([
      new ExaminationScoreCorrectionCaseSource(targetExaminationRepository),
      new FinalFiringScoreCorrectionCaseSource(
        new SqliteFinalRecoveryRepository(database),
        new SqliteFinalFiringRepository(database),
      ),
    ]),
  );
  const reviewCompetitionScope = new SqliteProtestEventScope(database);
  const observationReviewService = new ObservationReviewService(
    new StoredReviewSubjects(shotObservationEvidenceJournal, firingWindowJournal),
    new SqliteObservationReviewRepository(database),
    new AppliedReviewCorrections(
      new SqliteScoreCorrectionRepository(database),
      scoreCorrectionService,
      (eventId, scope) => reviewCompetitionScope.competitionIds(eventId, scope),
    ),
    undefined,
    (eventId, scope) => reviewCompetitionScope.competitionIds(eventId, scope),
  );
  const qualificationResultsReader = new QualificationResultsReader(
    queryBus,
    resultRepository,
    scoringDecisionRepository,
    competitionTypeRegistry,
    sanctionResultClassificationSource,
    qualificationOverlays,
    scoreCorrectionService,
  );
  const finalResultsReader = new FinalResultsReader(
    queryBus,
    finalResultRepository,
    scoringDecisionRepository,
    finalPlacementReviewRepository,
    competitionTypeRegistry,
    sanctionResultClassificationSource,
    scoreCorrectionService,
  );
  const scoringDecisionTargetResolver = new ScoringDecisionTargetResolver(
    queryBus,
    resultRepository,
    finalResultRepository,
    competitionTypeRegistry,
  );
  const teamResultsService = new TeamResultsService(
    participantRepository,
    resultRepository,
    qualificationResultsReader,
    new CompetitionTypeTeamTieBreakPolicyResolver(queryBus, competitionTypeRegistry),
  );
  const estBackupRecordParsers = new EstBackupRecordParserRegistry([
    new CanonicalJsonEstBackupRecordParser(),
    new CanonicalCsvEstBackupRecordParser(),
  ]);
  const estBackupSourceService = new EstBackupSourceService(
    new SqliteEstBackupSourceRepository(database),
    (id) => policyEvents.findById(id) !== null,
  );
  const estBackupRecordImportService = new EstBackupRecordImportService(
    new ElectronEstBackupRecordFileGateway(estBackupRecordParsers.supportedExtensions),
    estBackupRecordParsers,
    estBackupSourceService,
  );
  const estBackupFeedSelector = new ElectronEstBackupFeedSelector();
  const estBackupParserReferences = new EstBackupParserReferences();
  const estBackupCapturePlans = new SqliteEstBackupCapturePlanRepository(database);
  const estBackupCaptureService = new EstBackupCaptureService(
    estBackupFeedSelector,
    estBackupRecordImportService,
    (id) => policyEvents.findById(id) !== null,
    estBackupRecordParsers.supportedExtensions,
    undefined,
    undefined,
    {
      plans: estBackupCapturePlans,
      restoreFeed: (reference) => estBackupFeedSelector.restore(reference),
      describeParser: (parser) => estBackupParserReferences.describe(parser),
      restoreParser: (reference) => estBackupParserReferences.restore(reference),
    },
  );
  const finalVerificationSource = new FinalResultVerificationSource(
    queryBus,
    finalResultsReader,
    mixedTeamFinalResultRepository,
    competitionTypeRegistry,
  );
  const estBackupVerificationService = new EstBackupVerificationService(
    new SqliteEstBackupVerificationRepository(database),
    participantRepository,
    qualificationResultsReader,
    teamResultsService,
    new FinalEstBackupSubjectSource(finalVerificationSource, participantRepository),
    estBackupSourceService,
  );
  const resultVerificationService = new ResultVerificationService(
    resultVerificationRepository,
    new ResultVerificationSourceRegistry(
      [
        new QualificationResultVerificationSource(
          queryBus,
          qualificationResultsReader,
          competitionTypeRegistry,
          estBackupVerificationService,
        ),
        finalVerificationSource,
      ].map(
        (source) =>
          new PolicyBoundVerificationSource(source, (eventId, scope) =>
            publicationReviewPolicies.approvalRevision(eventId, scope),
          ),
      ),
    ),
    officialSigningPolicy,
  );
  const estBackupResultCheckService = new EstBackupResultCheckService(
    new SqliteEstBackupVerificationRepository(database),
    resultVerificationService,
  );
  const relayReadinessService = new RelayReadinessService(
    new SqliteRelayReadinessRepository(database),
    undefined,
    new SqliteRelayStartSettingsRepository(database),
  );
  const estInspectionStartService = new EstInspectionStartService(
    new SqliteEstInspectionStartSettingsRepository(database),
    new SqliteEstChampionshipInspectionRepository(database),
  );
  const backupCaptureReadiness = new BackupCaptureReadinessService(
    new SqliteBackupCaptureReadinessSettingsRepository(database),
    (eventId) => estBackupCaptureService.status(eventId),
    (eventId) => policyEvents.findById(eventId) !== null,
  );
  const competitionStartReadiness = new CompetitionStartReadiness([
    relayReadinessService,
    estInspectionStartService,
    backupCaptureReadiness,
  ]);
  const verifiedResultPublicationReadiness = new VerifiedResultPublicationReadiness(resultVerificationService);
  const resultPublicationReadiness = new GuardedResultPublicationReadiness(verifiedResultPublicationReadiness, [
    new OptionalResultPublicationBlocker(
      new ObservationReviewPublicationBlocker(observationReviewService, (eventId, scope) =>
        reviewCompetitionScope.competitionIds(eventId, scope),
      ),
      (eventId, scope) => publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireObservationReviews,
    ),
    new OptionalResultPublicationBlocker(
      new EquipmentControlPublicationBlocker(
        new StoredEquipmentControlPublicationSource(
          new SqlitePostCompetitionEquipmentCheckRepository(database),
          athleteSanctionRepository,
          athleteEntryReferenceSource,
        ),
      ),
      (eventId, scope) =>
        publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireEquipmentChecksComplete,
    ),
    new OptionalResultPublicationBlocker(
      new ProtestPublicationBlocker(new SqliteProtestRepository(database), (eventId, resultScope) =>
        new SqliteProtestEventScope(database).competitionIds(eventId, resultScope),
      ),
      (eventId, scope) => publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireProtestCasesComplete,
    ),
    new IrregularShotPublicationBlocker(
      irregularShotCaseRepository,
      rangeIncidentReportRepository,
      scoringDecisionRepository,
    ),
    new QualificationMalfunctionPublicationBlocker(new SqliteQualificationMalfunctionRepository(database)),
    new OptionalResultPublicationBlocker(
      new IncidentReportPublicationBlocker(rangeIncidentReportRepository, scoringDecisionRepository),
      (eventId, scope) => publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireIncidentReports,
    ),
    new OptionalResultPublicationBlocker(
      new FinalRecoveryPublicationBlocker(new SqliteFinalRecoveryRepository(database), (eventId) =>
        new SqliteFinalRecoveryEventScope(database).competitionIds(eventId),
      ),
      (eventId, scope) =>
        publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireFinalRecoveriesComplete,
    ),
  ]);
  const resultsBookResultSnapshots = new VerifiedResultsBookResultSnapshotSource(
    resultVerificationService,
    new ResultWorkflowOfficialRevisionSource(resultPublicationRepository, finalResultDeclarationRepository),
    resultPublicationReadiness,
  );
  const resultsBookService = new ResultsBookService(
    new SqliteResultsBookRepository(database),
    new SqliteResultsBookSource(database, resultsBookResultSnapshots, [
      new QualificationTeamRecordCandidateSource(database, teamResultsService, resultsBookResultSnapshots),
    ]),
    archiveFileGateway,
    undefined,
    new ElectronResultsBookDocumentExporter(),
    officialSigningPolicy,
  );
  const finalResultDeclarationService = new FinalResultDeclarationService(
    finalResultDeclarationRepository,
    resultPublicationReadiness,
  );
  const resultPublicationPolicyResolver = new RulePackResultPublicationPolicyResolver(
    queryBus,
    competitionTypeRegistry,
    rulePackRegistry,
    // Local/JRSF definitions can keep their existing operation until they get a Rule Pack.
    { scoreProtestWindowMs: 10 * 60 * 1000 },
  );

  // IPC Router
  const ipcRouter = new IpcRouter(operatorAccessService);
  registerOperatorAccess(ipcRouter, operatorAccessService);
  registerPublicationReviewPolicies(ipcRouter, publicationReviewPolicies);
  ipcRouter.register(backupCaptureReadinessContract, {
    get: async ({ competitionId }) => backupCaptureReadiness.get(competitionId),
    save: async (input) => backupCaptureReadiness.save(input),
    sources: async () =>
      estBackupCapturePlans.list().flatMap((plan) => {
        const event = policyEvents.findById(plan.eventId);
        return event ? [{ eventId: plan.eventId, label: `${event.name} · ${plan.sourceLabel}` }] : [];
      }),
  });

  // Timer Service
  const laneTimerService = new LaneTimerService(laneControlRepository, eventBus);

  // === Build ServiceRegistry ===
  const registry: ServiceRegistry = {
    observationReviewService,
    operationalSettingTargets: [
      {
        id: 'backup-capture',
        label: 'Independent backup capture availability',
        scope: 'COMPETITION',
        read: (competitionId) => {
          const current = backupCaptureReadiness.get(competitionId);
          return { mode: current.settings.mode, context: current.revision };
        },
        write: (competitionId, mode) => {
          const current = backupCaptureReadiness.get(competitionId);
          backupCaptureReadiness.save({ ...current.settings, mode, expectedRevision: current.revision });
        },
      },
      booleanOperationalSetting({
        id: 'publication-observations',
        label: 'Reviewed unscored shots and firing-window evidence before official publication',
        read: () => appConfigService.get('resultPublication.requireObservationReviews'),
        write: (required) => appConfigService.set('resultPublication.requireObservationReviews', required),
      }),
      booleanOperationalSetting({
        id: 'publication-equipment',
        label: 'Completed equipment checks and adjudications before official publication',
        read: () => appConfigService.get('resultPublication.requireEquipmentChecksComplete'),
        write: (required) => appConfigService.set('resultPublication.requireEquipmentChecksComplete', required),
      }),
      booleanOperationalSetting({
        id: 'publication-protests',
        label: 'Completed protest cases before official publication',
        read: () => appConfigService.get('resultPublication.requireProtestCasesComplete'),
        write: (required) => appConfigService.set('resultPublication.requireProtestCasesComplete', required),
      }),
      booleanOperationalSetting({
        id: 'operator-access',
        label: 'Operator authentication',
        read: () => operatorAccessStore.enabled(),
        write: (required) => operatorAccessService.setEnabledForCurrentActor(required),
      }),
      booleanOperationalSetting({
        id: 'publication-incidents',
        label: 'Incident reports before official publication',
        read: () => appConfigService.get('resultPublication.requireIncidentReports'),
        write: (required) => appConfigService.set('resultPublication.requireIncidentReports', required),
      }),
      booleanOperationalSetting({
        id: 'publication-recoveries',
        label: 'Completed final recoveries before official publication',
        read: () => appConfigService.get('resultPublication.requireFinalRecoveriesComplete'),
        write: (required) => appConfigService.set('resultPublication.requireFinalRecoveriesComplete', required),
      }),
    ],
    estInspectionStartService,
    relayReadinessService,
    competitionStartReadiness,
    database,
    eventBus,
    commandBus,
    queryBus,
    ipcRouter,
    windowManager,
    debugLogStore,
    laneControlRepository,
    laneTimerService,
    appConfigService,
    competitionTypeRegistry,
    rulePackRegistry,
    finalOperationService,
    resultRepository,
    finalResultRepository,
    mixedTeamFinalResultRepository,
    teamResultsService,
    estBackupRecordImportService,
    estBackupCaptureService,
    estBackupSourceService,
    estBackupResultCheckService,
    estBackupVerificationService,
    scoringDecisionAdmissionPolicy,
    scoringDecisionRepository,
    scoringDecisionTargetResolver,
    competitionShotJournal,
    firingWindowJournal,
    shotObservationEvidenceJournal,
    qualificationResultsReader,
    finalResultsReader,
    resultVerificationRepository,
    resultVerificationService,
    rangeIncidentReportRepository,
    targetExaminationRepository,
    evidenceFileService,
    malfunctionScoreApplicationService,
    scoreCorrectionService,
    rangeInterruptionRepository,
    competitionDataGuard,
    finalPlacementReviewRepository,
    resultPublicationRepository,
    resultPublicationReadiness,
    resultPublicationPolicyResolver,
    finalResultDeclarationService,
    irregularShotCaseRepository,
    operationalArchiveService,
    resultsBookService,
    athleteSanctionService,
    participantEligibilityReader,
    sanctionAuthorizationResolver,
  };

  // === Module Registration via ModuleLoader ===
  const moduleLoader = new ModuleLoader();
  const { lifecycleEntries, eventForwardingRules } = moduleLoader.load(modules, registry);

  // === Core Event Forwarding Rules ===
  // PhaseChanged, TimerTick, and TimerExpired are cross-cutting events defined at the composition root.
  const coreEventRules: EventForwardingRule[] = [
    {
      eventType: 'PhaseChanged',
      channel: eventsContract.channels.phaseChanged,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as PhaseChanged;
        return {
          phase: e.phase,
          remainingTime: e.remainingTime,
        };
      },
    },
    {
      eventType: 'TimerTick',
      channel: eventsContract.channels.timerTick,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as TimerTick;
        return {
          remainingTime: e.remainingTime,
          phase: e.phase,
        };
      },
    },
    {
      eventType: 'TimerExpired',
      channel: eventsContract.channels.timerExpired,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as TimerExpired;
        return {
          phase: e.phase,
        };
      },
    },
  ];

  // === Domain Event Forwarder ===
  const allEventForwardingRules = [...eventForwardingRules, ...coreEventRules];
  const domainEventForwarder = new DomainEventForwarder(eventBus, windowManager, allEventForwardingRules);

  // === Lifecycle ===
  const lifecycle = new AppLifecycle();

  // stopAll() reverses registration order, so register infrastructure dependencies first.
  // This keeps the database open until repositories complete their final flush.
  lifecycle.registerShutdownOnly('Database', () => {
    databaseManager.close();
  });
  lifecycle.registerShutdownOnly('LaneControlRepository', () => {
    laneControlRepository.close();
  });
  lifecycle.register({
    name: 'LaneTimerService',
    start: async () => laneTimerService.restoreActiveTimers(),
    stop: async () => laneTimerService.stopAllTimers(),
  });
  lifecycle.registerShutdownOnly('WindowManager', () => {
    windowManager.closeAllBoardWindows();
  });
  lifecycle.register({
    name: 'DomainEventForwarder',
    start: async () => domainEventForwarder.start(),
    stop: async () => domainEventForwarder.stop(),
  });
  lifecycle.registerShutdownOnly('ConsoleForwarder', () => {
    consoleForwarder.stop();
  });

  // Modules stop before their infrastructure dependencies.
  for (const entry of lifecycleEntries) {
    lifecycle.register(entry);
  }

  return {
    windowManager,
    domainEventForwarder,
    lifecycle,
    laneTimerService,
    databaseManager,
    appConfigService,
  };
}

/**
 * Resets the initialization flag for tests.
 */
export function resetAppInitialization(): void {
  initialized = false;
}
