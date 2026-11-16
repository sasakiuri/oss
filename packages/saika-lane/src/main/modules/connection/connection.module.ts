// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { TargetConnectionSupport } from '@/main/modules/target/domain/TargetConnectionSupport';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { connectionContract, eventsContract } from '@/shared/ipc/contracts';

import { createConnectToTargetHandler } from './application/handlers/ConnectToTargetHandler';
import { createDisconnectFromTargetHandler } from './application/handlers/DisconnectFromTargetHandler';
import { TargetModeSynchronizer } from './application/TargetModeSynchronizer';
import { UnexpectedDisconnectRecorder } from './application/UnexpectedDisconnectRecorder';
import { createConnectionIpcHandlers } from './infra/ConnectionIpcHandlers';
import { createShotIngestionHandler } from './infra/ShotIngestionHandler';

type ConnectionDeps =
  | 'adapterRegistry'
  | 'commandBus'
  | 'database'
  | 'startup'
  | 'sessionContextCache'
  | 'eventBus'
  | 'connectionRepository'
  | 'sessionRepository'
  | 'competitionRepository'
  | 'competitionInterruptionControl'
  | 'competitionShootOffControl'
  | 'timedTargetControl'
  | 'safetyStopControl'
  | 'usbManager'
  | 'ipcRouter'
  | 'mainWindow';

export const connectionModule: ModuleDefinition<ConnectionDeps> = {
  name: 'connection',
  deps: [
    'adapterRegistry',
    'commandBus',
    'database',
    'startup',
    'sessionContextCache',
    'eventBus',
    'connectionRepository',
    'sessionRepository',
    'competitionRepository',
    'competitionInterruptionControl',
    'competitionShootOffControl',
    'timedTargetControl',
    'safetyStopControl',
    'usbManager',
    'ipcRouter',
    'mainWindow',
  ] as const,
  register({
    adapterRegistry,
    commandBus,
    database,
    startup,
    sessionContextCache,
    eventBus,
    connectionRepository,
    sessionRepository,
    competitionRepository,
    competitionInterruptionControl,
    competitionShootOffControl,
    timedTargetControl,
    safetyStopControl,
    usbManager,
    ipcRouter,
    mainWindow,
  }) {
    const shotObservationRepository = new SqliteShotObservationRepository(database);
    // Session context cache for synchronous access by USBDataPipeline
    usbManager.setSessionContextProvider(() => sessionContextCache.getContext());

    // Notify once a complete shot has been converted, before ingestion and persistence.
    usbManager.setOnShotDetected(() => {
      if (startup.isReady() && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(eventsContract.channels.shotReceived, {});
      }
    });

    // Subscribe before the asynchronous bootstrap so a live event cannot be
    // missed or overwritten by an older persisted snapshot.
    sessionContextCache.subscribeEvents(() => usbManager.resetShotCounter());

    const modeSync = new TargetModeSynchronizer({
      sessionContext: sessionContextCache,
      sessionRepository,
      competitionRepository,
      competitionInterruptionControl,
      target: usbManager,
    });
    const unexpectedDisconnects = new UnexpectedDisconnectRecorder(connectionRepository, eventBus);

    const connectToTarget = createConnectToTargetHandler(connectionRepository, usbManager, eventBus, () =>
      modeSync.currentMode(),
    );

    // Register CQRS handlers
    commandBus.register(ConnectToTargetToken, async (input) => {
      // The first connection after an app restart must not send the Session
      // row's stale SIGHTING mode before competition recovery has completed.
      if ((await startup.snapshot()).status !== 'READY')
        throw new Error('Restore the saved run before connecting the target');
      await modeSync.settled();
      await unexpectedDisconnects.flushBeforeConnect();
      await connectToTarget(input);
    });
    const disconnectFromTarget = createDisconnectFromTargetHandler(connectionRepository, usbManager, eventBus);
    commandBus.register(DisconnectFromTargetToken, async (input) => {
      await unexpectedDisconnects.discard();
      await disconnectFromTarget(input);
    });

    // Register IPC handlers via IpcRouter
    const connectionHandlers = createConnectionIpcHandlers({
      commandBus,
      eventBus,
      usbManager,
      targetConnectionSupport: new TargetConnectionSupport(adapterRegistry),
    });
    ipcRouter.register(connectionContract, connectionHandlers);

    // Register shot ingestion handler: USB data → RecordShot command
    const handleShotIngestion = createShotIngestionHandler({
      eventBus,
      commandBus,
      sessionRepository,
      competitionRepository,
      shotObservationRepository,
      safetyStopReader: safetyStopControl,
      shootOffReader: competitionShootOffControl,
      interruptionReader: competitionInterruptionControl,
      timedTargetReader: timedTargetControl,
      onObservationFinalized: (evidenceId) => {
        eventBus.emit({
          type: 'ShotObservationRouted',
          timestamp: Date.now(),
          aggregateId: evidenceId,
          evidenceId,
        });
      },
    });
    usbManager.on('data', async (data) => {
      if (startup.isReady()) await handleShotIngestion(data);
    });

    usbManager.on('disconnected', () => unexpectedDisconnects.record());

    usbManager.on('connected', (reconnectedConnection) => {
      void (async () => {
        try {
          if ((await startup.snapshot()).status !== 'READY')
            throw new Error('Restore the saved run before connecting the target');
          if (!(await unexpectedDisconnects.completeReconnect(reconnectedConnection))) {
            return;
          }

          await modeSync.restoreAfterReconnect();
        } catch (err: unknown) {
          getLogger().warn('Failed to propagate automatic USB reconnect', 'main', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    });

    usbManager.on('reconnectFailed', () => {
      void unexpectedDisconnects.flushAfterReconnectFailure();
    });

    modeSync.subscribe(eventBus);
  },
};
