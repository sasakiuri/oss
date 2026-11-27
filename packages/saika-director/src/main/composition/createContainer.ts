import { dirname, join } from 'path';

import { ISSF_2026_RULE_PACKS, JRSF_2026_RULE_PACKS, RulePackRegistry } from '@sasakiuri/saika-rules';
import { app } from 'electron';
import { UpdaterService } from '@sasakiuri/saika-updater/main';
import { registerUpdater } from '@/main/infrastructure/updater/registerUpdater';
import { eventsContract } from '@/shared/ipc/contracts';

import { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { WindowManager } from '@/main/infrastructure/window/WindowManager';
import { SqliteEventRepository } from '@/main/modules/championship';
import { FinalOperationService, SqliteFinalOperationRepository } from '@/main/modules/final-operations';
import { LaneTimerService } from '@/main/modules/lane-control';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import {
  CommandLoggingMiddleware,
  QueryLoggingMiddleware,
} from '@/main/shared-infra/cqrs/middleware/LoggingMiddleware';
import { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';
import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { registerBuiltinCompetitionTypes } from '@/shared/competitionTypes/registerBuiltinCompetitionTypes';
import { Logger } from '@/shared/logging';

import { createBackupServices } from './createBackupServices';
import { createCompetitionServices } from './createCompetitionServices';
import { createEvidenceServices } from './createEvidenceServices';
import { createOperatorServices } from './createOperatorServices';
import { createPublicationServices } from './createPublicationServices';
import { createScoringServices } from './createScoringServices';
import { directorModules } from './modules';

import { createAppRuntime } from './createAppRuntime';
import { createOperationalSettingTargets } from './createOperationalSettingTargets';

const logger = Logger.create('createApp');

/**
 * Services exposed to main.ts.
 */
export interface AppServices {
  readonly updater: UpdaterService;
  readonly windowManager: WindowManager;
  readonly domainEventForwarder: DomainEventForwarder;
  readonly lifecycle: AppLifecycle;
  readonly laneTimerService: LaneTimerService;
  readonly databaseManager: DatabaseManager;
  readonly appConfigService: AppConfigService;
}

/** The Director database file. A pending restore must be applied to this same path before the app opens it. */
export function directorDatabasePath(userDataPath: string): string {
  return join(userDataPath, 'saika.db');
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
export function createApp(
  preloadPath: string,
  updateLifecycle: { beforeInstall: () => Promise<void>; onInstallError: (message: string) => void },
): AppServices {
  if (initialized) {
    const msg =
      'createApp() has already been called. Double initialization is not allowed because it causes duplicate side effects (console hooks, IPC handlers, event listeners).';
    logger.logError(msg, new Error(msg));
    throw new Error(msg);
  }
  initialized = true;

  // === Core Infrastructure ===
  const eventBus = new TypedEventBus();

  // Database
  const userDataPath = app.getPath('userData');
  const appVersion = app.getVersion();
  const dbPath = directorDatabasePath(userDataPath);
  const databaseManager = new DatabaseManager(dbPath);
  const database = databaseManager.getDatabase();

  // Repositories
  const appConfigService = new AppConfigService(database);
  const {
    laneControlRepository,
    resultRepository,
    finalResultRepository,
    mixedTeamFinalResultRepository,
    participantRepository,
    firingPointAssignmentRepository,
    eventSummaryReader,
    scoringDecisionRepository,
    competitionShotJournal,
    firingWindowJournal,
    shotObservationEvidenceJournal,
    resultVerificationRepository,
    rangeIncidentReportRepository,
    targetExaminationRepository,
    targetExaminationService,
    rangeInterruptionRepository,
    finalControlRepository,
    mixedTeamFinalControlRepository,
    finalRecoveryRepository,
    reserveTransferRepository,
    reserveTransferDataGuard,
    competitionDataGuard,
    finalPlacementReviewRepository,
    resultPublicationRepository,
    finalResultDeclarationRepository,
    irregularShotCaseRepository,
    athleteSanctionRepository,
    athleteEntryReferenceSource,
    athleteSanctionService,
    sanctionResultClassificationSource,
    participantEligibilityReader,
  } = createCompetitionServices({ database });

  const {
    operatorAccessStore,
    operatorAccessService,
    officialSigningPolicy,
    policyEvents,
    publicationReviewPolicies,
    sanctionAuthorizationResolver,
    scoringDecisionAdmissionPolicy,
  } = createOperatorServices({
    database,
    competitionTypeRegistry,
    appConfigService,
    resultPublicationRepository,
    finalResultDeclarationRepository,
  });

  const { evidenceFileService, archiveFileGateway, operationalArchiveService } = createEvidenceServices({
    userDataPath,
    database,
    targetExaminationRepository,
    appVersion,
    dbPath,
  });

  // Competition Type Registry
  registerBuiltinCompetitionTypes();
  const rulePackRegistry = new RulePackRegistry([...ISSF_2026_RULE_PACKS, ...JRSF_2026_RULE_PACKS]);
  const finalOperationRepository = new SqliteFinalOperationRepository(database);
  const eventRepository = new SqliteEventRepository(database, competitionTypeRegistry);
  const finalOperationService = new FinalOperationService(
    finalOperationRepository,
    competitionTypeRegistry,
    rulePackRegistry,
  );

  // Window Manager
  const windowManager = new WindowManager(preloadPath, join(dirname(preloadPath), '../renderer'));

  // CQRS
  const commandBus = new CommandBus();
  commandBus.use(new CommandLoggingMiddleware());
  const queryBus = new QueryBus();
  queryBus.use(new QueryLoggingMiddleware());

  const {
    malfunctionScoreApplicationService,
    scoreCorrectionService,
    observationReviewService,
    qualificationResultsReader,
    finalResultsReader,
    scoringDecisionTargetResolver,
    teamResultsService,
  } = createScoringServices({
    database,
    resultRepository,
    competitionTypeRegistry,
    finalResultRepository,
    targetExaminationRepository,
    shotObservationEvidenceJournal,
    firingWindowJournal,
    queryBus,
    scoringDecisionRepository,
    sanctionResultClassificationSource,
    finalPlacementReviewRepository,
    participantRepository,
  });

  const {
    estBackupSourceService,
    estBackupRecordImportService,
    estBackupCapturePlans,
    estBackupCaptureService,
    finalVerificationSource,
    estBackupVerificationService,
  } = createBackupServices({
    database,
    policyEvents,
    queryBus,
    finalResultsReader,
    mixedTeamFinalResultRepository,
    competitionTypeRegistry,
    participantRepository,
    qualificationResultsReader,
    teamResultsService,
  });

  const {
    resultVerificationService,
    estBackupResultCheckService,
    relayReadinessService,
    estInspectionStartService,
    backupCaptureReadiness,
    competitionStartReadiness,
    resultPublicationReadiness,
    resultsBookService,
    finalResultDeclarationService,
    resultPublicationPolicyResolver,
  } = createPublicationServices({
    resultVerificationRepository,
    queryBus,
    qualificationResultsReader,
    competitionTypeRegistry,
    estBackupVerificationService,
    finalVerificationSource,
    publicationReviewPolicies,
    officialSigningPolicy,
    database,
    estBackupCaptureService,
    policyEvents,
    observationReviewService,
    athleteSanctionRepository,
    athleteEntryReferenceSource,
    irregularShotCaseRepository,
    rangeIncidentReportRepository,
    scoringDecisionRepository,
    resultPublicationRepository,
    finalResultDeclarationRepository,
    teamResultsService,
    archiveFileGateway,
    rulePackRegistry,
  });

  // IPC Router
  const ipcRouter = new IpcRouter(operatorAccessService);
  const updater = new UpdaterService({
    isPackaged: app.isPackaged,
    currentVersion: appVersion,
    metadataNamespace: 'director',
    autoInstallOnAppQuit: false,
    beforeInstall: updateLifecycle.beforeInstall,
    onStateChange: (state) => {
      windowManager.broadcast(eventsContract.channels.appUpdateStateChanged, state);
      if (state.status === 'error') updateLifecycle.onInstallError(state.errorMessage ?? 'Unknown update error');
    },
    log: (level, message, details) => logger[level](message, details),
  });
  registerUpdater(ipcRouter, updater, windowManager);

  // Timer Service
  const laneTimerService = new LaneTimerService(laneControlRepository, eventBus);

  // === Build ServiceRegistry ===
  const registry: ServiceRegistry = {
    observationReviewService,
    operationalSettingTargets: createOperationalSettingTargets({
      appConfigService,
      operatorAccessStore,
      operatorAccessService,
      backupCaptureReadiness,
    }),
    estInspectionStartService,
    relayReadinessService,
    competitionStartReadiness,
    database,
    eventBus,
    commandBus,
    queryBus,
    ipcRouter,
    windowManager,
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
    targetExaminationService,
    evidenceFileService,
    malfunctionScoreApplicationService,
    scoreCorrectionService,
    rangeInterruptionRepository,
    participantRepository,
    firingPointAssignmentRepository,
    eventRepository,
    eventSummaryReader,
    finalOperationRepository,
    finalControlRepository,
    mixedTeamFinalControlRepository,
    finalRecoveryRepository,
    reserveTransferRepository,
    reserveTransferDataGuard,
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
    operatorAccessService,
    publicationReviewPolicyService: publicationReviewPolicies,
    backupCaptureReadinessService: backupCaptureReadiness,
    backupCaptureSources: { plans: estBackupCapturePlans, events: policyEvents },
  };

  // === Module Registration via ModuleLoader ===
  const moduleLoader = new ModuleLoader();
  const { lifecycleEntries, eventForwardingRules } = moduleLoader.load(directorModules, registry);

  const { lifecycle, domainEventForwarder } = createAppRuntime({
    eventBus,
    windowManager,
    laneControlRepository,
    laneTimerService,
    databaseManager,
    lifecycleEntries,
    eventForwardingRules,
  });

  return {
    updater,
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
