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
import { LocalCompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import { ConnectionRepositoryImpl } from '@/main/modules/connection/infra/ConnectionRepositoryImpl';
import { USBConnectionManager } from '@/main/modules/connection/infra/usb/USBConnectionManager';
import {
  QualificationRecoveryAdjudicationService,
  QualificationRecoveryService,
  QualificationRecoverySettlementService,
  SqliteQualificationRecoveryAdjudicationRepository,
  SqliteQualificationRecoveryRepository,
  SqliteQualificationRecoverySettlementRepository,
  SqliteQualificationRecoveryShotOutbox,
} from '@/main/modules/qualification-recovery';
import { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import { ReserveTransferCommandGuard } from '@/main/modules/reserve-lane-transfer/infra/ReserveTransferCommandGuard';
import { SqliteReserveLaneTransferJournal } from '@/main/modules/reserve-lane-transfer/infra/SqliteReserveLaneTransferJournal';
import {
  CompetitionSafetyTimerFreezer,
  LaneSafetyStopService,
  SqliteLaneSafetyStopRepository,
} from '@/main/modules/safety-stop';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';
import { LocalStorageAdapter } from '@/main/modules/settings/infra/LocalStorageAdapter';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import {
  BoundedShotTimingPolicy,
  SqliteTimedTargetSequenceRepository,
  timedTargetEnforcementModeFromEnvironment,
  TimedTargetSequenceService,
} from '@/main/modules/timed-target';
import { StoredTimingProfiles, TimingProfileService } from '@/main/modules/timing-profiles';
import { CommandBus, CommandLoggingMiddleware, QueryBus, QueryLoggingMiddleware } from '@/main/shared-infra/cqrs';
import { type IEventBus, TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { getLogger } from '@/main/shared-infra/logging';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { ConnectionSettingsSchema } from '@/shared/ipc/contracts';

import type { ServiceRegistry } from './ModuleDefinition';

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
  settingsStore.getAll();
  const eventBus = new TypedEventBus();
  const firstSessionStarted = waitForFirstSessionStart(eventBus);
  const db = createSqliteDb(join(userDataPath, 'saika-lane.db'));
  const sessionRepository = new SqliteSessionRepository(db);
  const connectionRepository = new ConnectionRepositoryImpl(storage);
  const competitionRepository = new CompetitionRepositoryImpl(storage);
  const printWindowService = new PrintWindowService(
    preloadPath,
    rendererDirectory,
    () => settingsStore.getAll().printing,
  );
  const adapterRegistry = new AdapterRegistry();
  const usbConnectionManager = new USBConnectionManager(adapterRegistry);

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
  let safetyStopControl: LaneSafetyStopService | null = null;
  const timerService = new LaneTimerService(
    competitionRepository,
    eventBus,
    () => safetyStopControl?.isStopped() !== true && !reserveTransferJournal.pending(),
  );
  const competitionInterruptionRepository = new LocalCompetitionInterruptionRepository(storage);
  const competitionInterruptionControl = new CompetitionInterruptionService(
    competitionInterruptionRepository,
    competitionRepository,
    timerService,
    commandBus,
    eventBus,
  );
  safetyStopControl = new LaneSafetyStopService(
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
  const timedTargetControl = new TimedTargetSequenceService(
    new SqliteTimedTargetSequenceRepository(db),
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
  const qualificationRecoveryAdjudicationControl = new QualificationRecoveryAdjudicationService(
    qualificationRecoveryControl,
    new SqliteQualificationRecoveryShotOutbox(db),
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

  const registry = {
    database: db,
    commandBus,
    queryBus,
    eventBus,
    ipcRouter,
    storage,
    settingsStore,
    usbManager: usbConnectionManager,
    sessionRepository,
    connectionRepository,
    competitionRepository,
    printWindowService,
    adapterRegistry,
    timerService,
    competitionInterruptionControl,
    competitionShootOffControl,
    qualificationRecoveryControl,
    qualificationRecoveryAdjudicationControl,
    qualificationRecoverySettlementControl,
    safetyStopControl,
    timedTargetControl,
    timingProfileService,
    mainWindow,
    userDataPath,
  } satisfies ServiceRegistry;
  return { registry, firstSessionStarted };
}

function waitForFirstSessionStart(eventBus: IEventBus): Promise<void> {
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    unsubscribe = eventBus.on('SessionStarted', () => {
      unsubscribe?.();
      unsubscribe = null;
      resolve();
    });
  });
}
