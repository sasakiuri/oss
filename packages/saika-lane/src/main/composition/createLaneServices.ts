// SPDX-License-Identifier: MIT
import { join } from 'path';

import { BrowserWindow } from 'electron';

import {
  commandPauseModeFromEnvironment,
  TimedTargetCommandPause,
} from '@/main/modules/command-observations/application/TimedTargetCommandPause';
import { SqliteCommandObservationRepository } from '@/main/modules/command-observations/infra/SqliteCommandObservationRepository';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import {
  CompetitionInterruptionService,
  LocalCompetitionInterruptionRepository,
} from '@/main/modules/competition-interruption';
import {
  LocalCompetitionShootOffControl,
  SqliteCompetitionShootOffShotOutbox,
} from '@/main/modules/competition-shoot-off';
import { ConnectionRepositoryImpl } from '@/main/modules/connection/infra/ConnectionRepositoryImpl';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { USBConnectionManager } from '@/main/modules/connection/infra/usb/USBConnectionManager';
import { EstComplaintSignalService, SqliteEstComplaintSignalRepository } from '@/main/modules/est-complaint-signal';
import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import {
  QualificationMalfunctionSignalService,
  SqliteQualificationMalfunctionSignalRepository,
} from '@/main/modules/qualification-malfunction-signal';
import {
  QualificationRecoveryAdjudicationService,
  QualificationRecoveryService,
  QualificationRecoverySettlementService,
  SqliteQualificationRecoveryAdjudicationRepository,
  SqliteQualificationRecoveryRepository,
  SqliteQualificationRecoverySettlementRepository,
  SqliteQualificationRecoveryShotOutbox,
} from '@/main/modules/qualification-recovery';
import { RangeOfficerRequestService, SqliteRangeOfficerRequestRepository } from '@/main/modules/range-officer-request';
import { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import { ReserveLaneTransferService } from '@/main/modules/reserve-lane-transfer/application/ReserveLaneTransferService';
import { ReserveTransferCommandGuard } from '@/main/modules/reserve-lane-transfer/infra/ReserveTransferCommandGuard';
import { SqliteReserveLaneTransferJournal } from '@/main/modules/reserve-lane-transfer/infra/SqliteReserveLaneTransferJournal';
import {
  StoredReserveLaneTransferState,
  type ITransferAssignmentPort,
} from '@/main/modules/reserve-lane-transfer/infra/StoredReserveLaneTransferState';
import {
  CompetitionSafetyTimerFreezer,
  LaneSafetyStopService,
  SqliteLaneSafetyStopRepository,
} from '@/main/modules/safety-stop';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';
import { LocalStorageAdapter } from '@/main/modules/settings/infra/LocalStorageAdapter';
import { SqliteShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/infra/SqliteShotObservationEvidenceOutbox';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';
import {
  BoundedShotTimingPolicy,
  SqliteTimedTargetSequenceRepository,
  timedTargetEnforcementModeFromEnvironment,
  TimedTargetSequenceService,
} from '@/main/modules/timed-target';
import { StoredTimingProfiles, TimingProfileService } from '@/main/modules/timing-profiles';
import { CommandBus, CommandLoggingMiddleware, QueryBus, QueryLoggingMiddleware } from '@/main/shared-infra/cqrs';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { getLogger } from '@/main/shared-infra/logging';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { ActiveRunStartup } from '@/main/startup/restoreActiveRun';
import { ConnectionSettingsSchema } from '@/shared/ipc/contracts';

import type { ServiceRegistry } from './ModuleDefinition';
import { StartCompetitionToken } from './tokens';

export interface LaneApplicationPaths {
  userDataPath: string;
  preloadPath: string;
  rendererDirectory: string;
}

/** Constructs services; module registration and window behavior are owned by createLaneApp. */
export function createLaneServices(
  mainWindow: BrowserWindow,
  { userDataPath, preloadPath, rendererDirectory }: LaneApplicationPaths,
) {
  const logger = getLogger();
  // 1. Create infrastructure components
  const storage = new LocalStorageAdapter({ name: 'saika-lane' });
  const settingsStore = new AppSettingsStore({
    filePath: join(userDataPath, 'settings.json'),
    storage,
  });
  const competitionShootOffControl = new LocalCompetitionShootOffControl(storage);
  settingsStore.initialize();
  const eventBus = new TypedEventBus();
  const membership = new DirectorMembership(storage, eventBus);
  const db = createSqliteDb(join(userDataPath, 'saika-lane.db'));
  const sessionContextCache = new SessionContextCache(eventBus);
  const sessionRepository = new SqliteSessionRepository(db);
  const connectionRepository = new ConnectionRepositoryImpl(storage);
  const competitionRepository = new CompetitionRepositoryImpl(storage);
  const printWindowService = new PrintWindowService(
    preloadPath,
    rendererDirectory,
    () => settingsStore.getAll().printing,
  );
  const adapterRegistry = new AdapterRegistry();
  const usbConnectionManager = new USBConnectionManager({
    adapters: adapterRegistry,
    dataParser: new SerialDataParser(SerialDataParser.defaultParsers()),
    dataConverter: new DataConversionService(adapterRegistry),
  });

  usbConnectionManager.on('error', ({ error, recoverable }) => {
    logger.error('[USBConnectionManager] Error', 'usb', { error: error.stack, recoverable });
  });

  // 2. Create application layer
  const commandBus = new CommandBus();
  const queryBus = new QueryBus();
  const ipcRouter = new IpcRouter();
  const reserveTransferJournal = new SqliteReserveLaneTransferJournal(db);
  commandBus.use(new ReserveTransferCommandGuard(() => reserveTransferJournal.pending()));

  // Add middleware
  commandBus.use(new CommandLoggingMiddleware());
  queryBus.use(new QueryLoggingMiddleware());

  // 3. Load modules (registers all command/query handlers)
  // The timer permit reads startup and the safety latch only when a timer runs, after both exist.
  const timerService = new LaneTimerService(
    competitionRepository,
    eventBus,
    storage,
    (): boolean => startup.isReady() && !safetyStopControl.isStopped() && !reserveTransferJournal.pending(),
  );
  const competitionInterruptionRepository = new LocalCompetitionInterruptionRepository(storage);
  const competitionInterruptionControl = new CompetitionInterruptionService(
    competitionInterruptionRepository,
    competitionRepository,
    timerService,
    commandBus,
    eventBus,
    sessionRepository,
  );
  const safetyStopControl = new LaneSafetyStopService(
    new SqliteLaneSafetyStopRepository(db),
    new CompetitionSafetyTimerFreezer(competitionRepository, timerService),
    eventBus,
    () => !reserveTransferJournal.pending(),
  );
  const timingProfileService = new TimingProfileService(new StoredTimingProfiles(storage), {
    // AppSettingsStore maintains this snapshot; assessment must not trigger settings-file writes.
    connection: () => ConnectionSettingsSchema.nullable().parse(storage.get('connectionSettings') ?? null),
    hasActiveCompetition: async () => !!(await competitionRepository.findActive()),
  });
  const timedTargetSequenceRepository = new SqliteTimedTargetSequenceRepository(db);
  const timedTargetControl = new TimedTargetSequenceService(
    timedTargetSequenceRepository,
    {
      publish: (state) => {
        eventBus.emit({
          type: 'TimedTargetSequenceChanged',
          timestamp: Date.now(),
          aggregateId: state.competitionId,
          state,
        });
      },
    },
    timedTargetEnforcementModeFromEnvironment(process.env),
    undefined,
    new TimedTargetCommandPause(
      new SqliteCommandObservationRepository(db),
      commandPauseModeFromEnvironment(process.env),
    ),
    new BoundedShotTimingPolicy(() => timingProfileService.effectiveSettings()),
  );
  const qualificationRecoveryRepository = new SqliteQualificationRecoveryRepository(db);
  const qualificationRecoveryControl = new QualificationRecoveryService(
    qualificationRecoveryRepository,
    competitionRepository,
    competitionInterruptionControl,
    timedTargetControl,
    eventBus,
  );
  const qualificationRecoveryShotOutbox = new SqliteQualificationRecoveryShotOutbox(db);
  const qualificationRecoveryAdjudicationControl = new QualificationRecoveryAdjudicationService(
    qualificationRecoveryControl,
    qualificationRecoveryShotOutbox,
    new SqliteQualificationRecoveryAdjudicationRepository(db),
    sessionRepository,
    competitionRepository,
    competitionInterruptionControl,
    eventBus,
  );
  const qualificationRecoverySettlementControl = new QualificationRecoverySettlementService(
    new SqliteQualificationRecoverySettlementRepository(db),
    sessionRepository,
    competitionRepository,
    competitionInterruptionControl,
    qualificationRecoveryControl,
    eventBus,
  );

  // Outboxes the MQTT module drains; their rows are written by the features that record the shots.
  const competitionShootOffShotOutbox = new SqliteCompetitionShootOffShotOutbox(db);
  const shotObservationEvidenceOutbox = new SqliteShotObservationEvidenceOutbox(db);

  // Lane-owned signals keep their state in SQLite; the MQTT module publishes them and serves their IPC.
  const rangeOfficerRequestService = new RangeOfficerRequestService(new SqliteRangeOfficerRequestRepository(db));
  const qualificationMalfunctionSignalService = new QualificationMalfunctionSignalService(
    new SqliteQualificationMalfunctionSignalRepository(db),
  );
  const estComplaintSignalService = new EstComplaintSignalService(new SqliteEstComplaintSignalRepository(db));

  const startup = new ActiveRunStartup({
    setAsideActiveRun: () => competitionRepository.clearActivePointer(),
    competitions: competitionRepository,
    sessions: sessionRepository,
    membership,
    timer: timerService,
    safetyCompetitionId: () => safetyStopControl.getState()?.timerSnapshot?.competitionId ?? null,
    interruptions: competitionInterruptionControl,
    safetyStopped: () => safetyStopControl.isStopped(),
    transferPending: () => reserveTransferJournal.pending(),
    context: sessionContextCache,
    createCompetition: () =>
      commandBus.execute(StartCompetitionToken, {
        competitionTypeId: settingsStore.getUserPreferences().competitionTypeId || 'BR60S',
      }),
    stopIndependentWorkflows: () => timedTargetControl.dispose(),
    restoreIndependentWorkflows: () => {
      timedTargetControl.restore();
      qualificationRecoveryControl.restoreActive();
    },
  });
  const registry = {
    database: db,
    commandBus,
    queryBus,
    eventBus,
    ipcRouter,
    storage,
    membership,
    sessionContextCache,
    startup,
    settingsStore,
    usbManager: usbConnectionManager,
    sessionRepository,
    connectionRepository,
    competitionRepository,
    competitionCatalog: competitionRepository,
    printWindowService,
    adapterRegistry,
    timerService,
    competitionInterruptionControl,
    competitionShootOffControl,
    qualificationRecoveryControl,
    qualificationRecoveryAdjudicationControl,
    qualificationRecoverySettlementControl,
    safetyStopControl,
    createReserveTransferControl: (assignments: ITransferAssignmentPort) =>
      new ReserveLaneTransferService(
        reserveTransferJournal,
        new StoredReserveLaneTransferState(
          competitionRepository,
          sessionRepository,
          assignments,
          safetyStopControl,
          competitionInterruptionControl,
          eventBus,
        ),
        () => settingsStore.getLaneId(),
      ),
    rangeOfficerRequestService,
    qualificationMalfunctionSignalService,
    estComplaintSignalService,
    timedTargetControl,
    timedTargetSequenceRepository,
    qualificationRecoveryShotOutbox,
    competitionShootOffShotOutbox,
    shotObservationEvidenceOutbox,
    timingProfileService,
    mainWindow,
    userDataPath,
  } satisfies ServiceRegistry;
  return { registry };
}
