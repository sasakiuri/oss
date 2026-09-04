/**
 * createContainer.ts
 *
 * Application dependency factory.
 *
 * Centralizes all dependency construction in the composition root.
 */

import { app } from 'electron';
import { join } from 'path';

import { championshipModule, SqliteParticipantRepository } from '@/main/modules/championship';
import { laneControlModule } from '@/main/modules/lane-control';
import {
  FinalResultsReader,
  QualificationResultsReader,
  resultsModule,
  ScoringDecisionTargetResolver,
  SqliteFinalResultRepository,
  SqliteResultRepository,
} from '@/main/modules/results';
import { scoringDecisionsModule, SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { shootoffModule } from '@/main/modules/shootoff';
import { boardModule } from '@/main/modules/board';
import { competitionAnnouncementsModule } from '@/main/modules/competition-announcements';
import {
  mqttModule,
  SqliteCompetitionShotJournal,
  SqliteFiringWindowJournal,
  SqliteShotObservationEvidenceJournal,
} from '@/main/modules/mqtt';
import {
  FinalResultVerificationSource,
  QualificationResultVerificationSource,
  resultVerificationModule,
  ResultVerificationService,
  ResultVerificationSourceRegistry,
  SqliteResultVerificationRepository,
} from '@/main/modules/result-verification';
import { incidentReportsModule, SqliteRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import {
  AthleteSanctionResultClassificationSource,
  AthleteSanctionParticipantEligibilityReader,
  AthleteSanctionService,
  athleteSanctionsModule,
  ChampionshipSanctionScoringDecisionAdmissionPolicy,
  ManualAttestationSanctionAuthorizationResolver,
  SqliteAthleteEntryReferenceSource,
  SqliteAthleteSanctionRepository,
} from '@/main/modules/athlete-sanctions';
import {
  EvidenceHoldCompetitionDataGuard,
  SqliteTargetExaminationRepository,
  targetExaminationsModule,
} from '@/main/modules/target-examinations';
import {
  InterruptionCompetitionDataGuard,
  rangeInterruptionsModule,
  SqliteRangeInterruptionRepository,
} from '@/main/modules/range-interruptions';
import { relayReadinessModule } from '@/main/modules/relay-readiness';
import { relayAthleteLifecycleModule } from '@/main/modules/relay-athlete-lifecycle';
import { estChampionshipInspectionsModule } from '@/main/modules/est-championship-inspections';
import { eliminationPlanningModule } from '@/main/modules/elimination-planning';
import {
  CompetitionTypeTeamTieBreakPolicyResolver,
  SqliteMixedTeamFinalResultRepository,
  teamResultsModule,
  TeamResultsService,
} from '@/main/modules/team-results';
import { protestsModule } from '@/main/modules/protests';
import {
  CanonicalCsvEstBackupRecordParser,
  CanonicalJsonEstBackupRecordParser,
  ElectronEstBackupRecordFileGateway,
  EstBackupRecordImportService,
  EstBackupRecordParserRegistry,
  EstBackupVerificationService,
  estBackupVerificationModule,
  SqliteEstBackupVerificationRepository,
} from '@/main/modules/est-backup-verification';
import { finalControlModule } from '@/main/modules/final-control';
import { adjudicationCasesModule } from '@/main/modules/adjudication-cases';
import {
  irregularShotCasesModule,
  IrregularShotPublicationBlocker,
  SqliteIrregularShotCaseRepository,
} from '@/main/modules/irregular-shot-cases';
import {
  CompetitionEvidenceBundleBuilder,
  ElectronArchiveFileGateway,
  OperationalArchiveService,
  operationalArchivesModule,
  SqliteCompetitionEvidenceSource,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives';
import {
  QualificationTeamRecordCandidateSource,
  ResultWorkflowOfficialRevisionSource,
  ResultsBookService,
  resultsBooksModule,
  SqliteResultsBookRepository,
  SqliteResultsBookSource,
  VerifiedResultsBookResultSnapshotSource,
} from '@/main/modules/results-books';
import { finalRecoveriesModule } from '@/main/modules/final-recoveries';
import { startListsModule } from '@/main/modules/start-lists';
import {
  FinalOperationService,
  finalOperationsModule,
  SqliteFinalOperationRepository,
} from '@/main/modules/final-operations';
import { mixedTeamFinalControlModule } from '@/main/modules/mixed-team-final-control';
import { squaddingModule } from '@/main/modules/squadding';
import { productionOperationsModule } from '@/main/modules/production-operations';
import { mixedTeamTimeoutsModule } from '@/main/modules/mixed-team-timeouts';
import {
  finalPlacementReviewModule,
  SqliteFinalPlacementReviewRepository,
} from '@/main/modules/final-placement-review';
import {
  FinalResultDeclarationService,
  GuardedResultPublicationReadiness,
  resultPublicationModule,
  RulePackResultPublicationPolicyResolver,
  SqliteFinalResultDeclarationRepository,
  SqliteResultPublicationRepository,
  VerifiedResultPublicationReadiness,
} from '@/main/modules/result-publication';
import {
  ISSF_2026_25M_PISTOL_RULE_PACKS,
  ISSF_2026_10M_MIXED_RULE_PACKS,
  ISSF_2026_10M_RULE_PACKS,
  ISSF_2026_50M_RIFLE_RULE_PACKS,
  RulePackRegistry,
} from '@sasakiuri/saika-rules';

// Infrastructure
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { DebugLogStore } from '@/main/infrastructure/logging/Logger';
import { ConsoleForwarder } from '@/main/infrastructure/logging/ConsoleForwarder';
import { WindowManager } from '@/main/infrastructure/window/WindowManager';
import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { allMigrations } from '@/main/infrastructure/database/migrations';
import { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import { SqliteLaneControlRepository } from '@/main/modules/lane-control';
import { LaneTimerService } from '@/main/modules/lane-control';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';

// Application Layer (type-safe CQRS buses)
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import {
  CommandLoggingMiddleware,
  QueryLoggingMiddleware,
} from '@/main/shared-infra/cqrs/middleware/LoggingMiddleware';

import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { registerBuiltinCompetitionTypes } from '@/shared/competitionTypes/registerBuiltinCompetitionTypes';
import { eventsContract } from '@/shared/ipc/contracts';
import type { EventForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import type { PhaseChanged, TimerTick, TimerExpired } from '@/main/shared-infra/events/coreEvents';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import { Logger } from '@/shared/utils/Logger';
import { CompositeCompetitionDataGuard } from '@/main/shared-infra/operations/CompositeCompetitionDataGuard';

const logger = Logger.create('createApp');

// Static module list (Vite/Electron safe — no dynamic import)
const modules = [
  championshipModule,
  athleteSanctionsModule,
  laneControlModule,
  scoringDecisionsModule,
  resultsModule,
  shootoffModule,
  boardModule,
  competitionAnnouncementsModule,
  targetExaminationsModule,
  rangeInterruptionsModule,
  relayReadinessModule,
  relayAthleteLifecycleModule,
  estChampionshipInspectionsModule,
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
  startListsModule,
  mixedTeamFinalControlModule,
  squaddingModule,
  productionOperationsModule,
  mixedTeamTimeoutsModule,
  mqttModule,
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
    new EvidenceHoldCompetitionDataGuard(targetExaminationRepository),
    new InterruptionCompetitionDataGuard(rangeInterruptionRepository),
  ]);
  const finalPlacementReviewRepository = new SqliteFinalPlacementReviewRepository(database);
  const resultPublicationRepository = new SqliteResultPublicationRepository(database);
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
  const sanctionAuthorizationResolver = new ManualAttestationSanctionAuthorizationResolver();
  const scoringDecisionAdmissionPolicy = new ChampionshipSanctionScoringDecisionAdmissionPolicy();
  const archiveFileGateway = new ElectronArchiveFileGateway();
  const operationalArchiveService = new OperationalArchiveService(
    new SqliteCompetitionEvidenceSource(database),
    new CompetitionEvidenceBundleBuilder(app.getVersion()),
    archiveFileGateway,
    new SqliteDatabaseBackupGateway(database, dbPath, app.getPath('userData'), allMigrations.at(-1)?.version ?? 0),
  );
  // Competition Type Registry
  registerBuiltinCompetitionTypes();
  const rulePackRegistry = new RulePackRegistry([
    ...ISSF_2026_10M_RULE_PACKS,
    ...ISSF_2026_10M_MIXED_RULE_PACKS,
    ...ISSF_2026_50M_RIFLE_RULE_PACKS,
    ...ISSF_2026_25M_PISTOL_RULE_PACKS,
  ]);
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

  const qualificationResultsReader = new QualificationResultsReader(
    queryBus,
    resultRepository,
    scoringDecisionRepository,
    competitionTypeRegistry,
    sanctionResultClassificationSource,
  );
  const finalResultsReader = new FinalResultsReader(
    queryBus,
    finalResultRepository,
    scoringDecisionRepository,
    finalPlacementReviewRepository,
    competitionTypeRegistry,
    sanctionResultClassificationSource,
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
  const estBackupRecordImportService = new EstBackupRecordImportService(
    new ElectronEstBackupRecordFileGateway(estBackupRecordParsers.supportedExtensions),
    estBackupRecordParsers,
  );
  const estBackupVerificationService = new EstBackupVerificationService(
    new SqliteEstBackupVerificationRepository(database),
    participantRepository,
    qualificationResultsReader,
    teamResultsService,
  );
  const resultVerificationService = new ResultVerificationService(
    resultVerificationRepository,
    new ResultVerificationSourceRegistry([
      new QualificationResultVerificationSource(
        queryBus,
        qualificationResultsReader,
        competitionTypeRegistry,
        estBackupVerificationService,
      ),
      new FinalResultVerificationSource(
        queryBus,
        finalResultsReader,
        mixedTeamFinalResultRepository,
        competitionTypeRegistry,
      ),
    ]),
  );
  const verifiedResultPublicationReadiness = new VerifiedResultPublicationReadiness(resultVerificationService);
  const resultPublicationReadiness = new GuardedResultPublicationReadiness(verifiedResultPublicationReadiness, [
    new IrregularShotPublicationBlocker(
      irregularShotCaseRepository,
      rangeIncidentReportRepository,
      scoringDecisionRepository,
    ),
  ]);
  const finalResultDeclarationRepository = new SqliteFinalResultDeclarationRepository(database);
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
  const ipcRouter = new IpcRouter();

  // Timer Service
  const laneTimerService = new LaneTimerService(laneControlRepository, eventBus);

  // === Build ServiceRegistry ===
  const registry: ServiceRegistry = {
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
