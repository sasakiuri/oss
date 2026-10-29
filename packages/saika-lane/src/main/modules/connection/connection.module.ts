// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
import type { Connection } from '@/main/modules/connection/domain/Connection';
import { Mode } from '@/main/modules/session/domain/Mode';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { TargetConnectionSupport } from '@/main/modules/target/domain/TargetConnectionSupport';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { connectionContract, eventsContract } from '@/shared/ipc/contracts';

import { createConnectToTargetHandler } from './application/handlers/ConnectToTargetHandler';
import { createDisconnectFromTargetHandler } from './application/handlers/DisconnectFromTargetHandler';
import { createConnectionIpcHandlers } from './infra/ConnectionIpcHandlers';
import { SessionContextCache } from './infra/SessionContextCache';
import { createShotIngestionHandler } from './infra/ShotIngestionHandler';

type ConnectionDeps =
  | 'adapterRegistry'
  | 'commandBus'
  | 'database'
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
    const sessionContextCache = new SessionContextCache(eventBus);
    usbManager.setSessionContextProvider(() => sessionContextCache.getContext());

    // Notify once a complete shot has been converted, before ingestion and persistence.
    usbManager.setOnShotDetected(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(eventsContract.channels.shotReceived, {});
      }
    });

    // Subscribe before the asynchronous bootstrap so a live event cannot be
    // missed or overwritten by an older persisted snapshot.
    sessionContextCache.subscribeEvents(() => usbManager.resetShotCounter());

    // Bootstrap context from the persisted session and competition stage (app restart scenario)
    const contextBootstrap = sessionContextCache
      .bootstrap(sessionRepository, competitionRepository, competitionInterruptionControl)
      .catch((err: unknown) => {
        getLogger().warn('Session context bootstrap failed; cache will be populated by events', 'main', {
          err: err instanceof Error ? err.message : String(err),
        });
      });

    const getCurrentMode = (): Mode => {
      try {
        return sessionContextCache.getContext().mode;
      } catch {
        return Mode.sighting();
      }
    };

    // Refresh only the cached projection on shot/progress notifications. Existing
    // stage/initial-start sends use the same resolver and remain the only transition sends.
    let competitionModeUpdates = Promise.resolve();
    const refreshCompetitionMode = (send: boolean): void => {
      competitionModeUpdates = competitionModeUpdates
        .then(async () => {
          const mode = await sessionContextCache.bootstrap(
            sessionRepository,
            competitionRepository,
            competitionInterruptionControl,
          );
          if (send && mode) await usbManager.sendMode(mode);
        })
        .catch((err: unknown) => {
          getLogger().warn('Failed to refresh competition target mode', 'main', {
            err: err instanceof Error ? err.message : String(err),
          });
        });
    };

    const connectToTarget = createConnectToTargetHandler(connectionRepository, usbManager, eventBus, getCurrentMode);

    let pendingUnexpectedDisconnect: Promise<Connection | null> | null = null;

    const takePendingUnexpectedDisconnect = async (): Promise<Connection | null> => {
      const pending = pendingUnexpectedDisconnect;
      pendingUnexpectedDisconnect = null;
      return pending ? await pending : null;
    };

    const flushPendingUnexpectedDisconnect = async (): Promise<void> => {
      try {
        const disconnectedConnection = await takePendingUnexpectedDisconnect();
        if (!disconnectedConnection) {
          return;
        }

        await connectionRepository.save(disconnectedConnection);
        eventBus.emit({
          type: 'ConnectionLost',
          timestamp: Date.now(),
          aggregateId: disconnectedConnection.id,
          reason: 'USB device disconnected unexpectedly',
        });
      } catch (err: unknown) {
        getLogger().warn('Failed to finalize pending unexpected USB disconnect before manual connect', 'main', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const discardPendingUnexpectedDisconnect = async (): Promise<void> => {
      try {
        await takePendingUnexpectedDisconnect();
      } catch (err: unknown) {
        getLogger().warn('Failed to discard pending unexpected USB disconnect before manual disconnect', 'main', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Register CQRS handlers
    commandBus.register(ConnectToTargetToken, async (input) => {
      // The first connection after an app restart must not send the Session
      // row's stale SIGHTING mode before competition recovery has completed.
      await contextBootstrap;
      await competitionModeUpdates;
      await flushPendingUnexpectedDisconnect();
      await connectToTarget(input);
    });
    const disconnectFromTarget = createDisconnectFromTargetHandler(connectionRepository, usbManager, eventBus);
    commandBus.register(DisconnectFromTargetToken, async (input) => {
      await discardPendingUnexpectedDisconnect();
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
    usbManager.on('data', handleShotIngestion);

    usbManager.on('disconnected', () => {
      pendingUnexpectedDisconnect = (async () => {
        try {
          const activeConnection = await connectionRepository.findActive();
          if (!activeConnection || activeConnection.isDisconnected) {
            return null;
          }

          return activeConnection.disconnect();
        } catch (err: unknown) {
          getLogger().warn('Failed to propagate unexpected USB disconnect', 'main', {
            err: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      })();
    });

    usbManager.on('connected', (reconnectedConnection) => {
      void (async () => {
        try {
          await contextBootstrap;
          const disconnectedConnection = await takePendingUnexpectedDisconnect();
          if (!disconnectedConnection) {
            return;
          }

          await connectionRepository.save(disconnectedConnection);
          await connectionRepository.save(reconnectedConnection);

          eventBus.emit({
            type: 'ConnectionEstablished',
            timestamp: Date.now(),
            aggregateId: reconnectedConnection.id,
            manufacturer: reconnectedConnection.manufacturer,
            portPath: reconnectedConnection.portPath,
            deviceId: reconnectedConnection.deviceId,
          });

          await competitionModeUpdates;
          usbManager.sendMode(getCurrentMode()).catch((err: unknown) => {
            getLogger().warn('Failed to restore device mode after automatic USB reconnect', 'main', {
              err: err instanceof Error ? err.message : String(err),
            });
          });
        } catch (err: unknown) {
          getLogger().warn('Failed to propagate automatic USB reconnect', 'main', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    });

    usbManager.on('reconnectFailed', () => {
      void (async () => {
        try {
          const disconnectedConnection = await takePendingUnexpectedDisconnect();
          if (!disconnectedConnection) {
            return;
          }

          await connectionRepository.save(disconnectedConnection);

          eventBus.emit({
            type: 'ConnectionLost',
            timestamp: Date.now(),
            aggregateId: disconnectedConnection.id,
            reason: 'USB device disconnected unexpectedly',
          });
        } catch (err: unknown) {
          getLogger().warn('Failed to finalize unexpected USB disconnect', 'main', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    });

    // Subscribe to ModeSwitched events → send mode byte to device
    eventBus.on('ModeSwitched', (event) => {
      usbManager.sendMode(event.newMode).catch((err: unknown) => {
        getLogger().warn('sendMode failed on ModeSwitched', 'main', {
          mode: event.newMode.value,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    });

    eventBus.on('AthleteTargetModeChanged', (event) => {
      usbManager.sendMode(event.newMode).catch((err: unknown) => {
        getLogger().warn('sendMode failed on AthleteTargetModeChanged', 'main', {
          mode: event.newMode.value,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    });

    eventBus.on('StageAdvanced', () => refreshCompetitionMode(true));
    eventBus.on('PhaseChanged', (event) => {
      refreshCompetitionMode(event.previousPhase === 'IDLE' && event.newPhase === 'ACTIVE');
    });
    eventBus.on('ShotRecorded', (event) => {
      if (event.shot.mode.isSighting() && event.shot.competitionContext?.athleteModeObserved)
        refreshCompetitionMode(false);
    });
    eventBus.on('CompetitionProgressChanged', () => refreshCompetitionMode(false));
    eventBus.on('SeriesCompleted', () => refreshCompetitionMode(false));
  },
};
