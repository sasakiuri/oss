// SPDX-License-Identifier: MIT
/**
 * Connection module definition
 *
 * Registers command handlers and IPC handlers for target connection management.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
import type { Connection } from '@/main/modules/connection/domain/Connection';
import { Mode } from '@/main/modules/session/domain/Mode';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { connectionContract, eventsContract } from '@/shared/ipc/contracts';

import { createConnectToTargetHandler } from './application/handlers/ConnectToTargetHandler';
import { createDisconnectFromTargetHandler } from './application/handlers/DisconnectFromTargetHandler';
import { createConnectionIpcHandlers } from './infra/ConnectionIpcHandlers';
import { SessionContextCache } from './infra/SessionContextCache';
import { createShotIngestionHandler } from './infra/ShotIngestionHandler';

type ConnectionDeps =
  | 'commandBus'
  | 'eventBus'
  | 'connectionRepository'
  | 'sessionRepository'
  | 'competitionRepository'
  | 'usbManager'
  | 'ipcRouter'
  | 'mainWindow';

export const connectionModule: ModuleDefinition<ConnectionDeps> = {
  name: 'connection',
  deps: [
    'commandBus',
    'eventBus',
    'connectionRepository',
    'sessionRepository',
    'competitionRepository',
    'usbManager',
    'ipcRouter',
    'mainWindow',
  ] as const,
  register({
    commandBus,
    eventBus,
    connectionRepository,
    sessionRepository,
    competitionRepository,
    usbManager,
    ipcRouter,
    mainWindow,
  }) {
    // Session context cache for synchronous access by USBDataPipeline
    const sessionContextCache = new SessionContextCache(eventBus);
    usbManager.setSessionContextProvider(() => sessionContextCache.getContext());

    // Register raw data callback for immediate sound notification (before parsing)
    usbManager.setOnShotDetected(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(eventsContract.channels.shotReceived, {});
      }
    });

    // Bootstrap context from persisted active session (app restart scenario)
    sessionContextCache.bootstrap(sessionRepository).catch((err: unknown) => {
      getLogger().warn('Session context bootstrap failed; cache will be populated by events', 'main', {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    // Subscribe to session events for cache updates + shot counter reset
    sessionContextCache.subscribeEvents(() => usbManager.resetShotCounter());

    const connectToTarget = createConnectToTargetHandler(connectionRepository, usbManager, eventBus);

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
      await flushPendingUnexpectedDisconnect();
      await connectToTarget(input);
    });
    const disconnectFromTarget = createDisconnectFromTargetHandler(connectionRepository, usbManager, eventBus);
    commandBus.register(DisconnectFromTargetToken, async (input) => {
      await discardPendingUnexpectedDisconnect();
      await disconnectFromTarget(input);
    });

    // Register IPC handlers via IpcRouter
    const connectionHandlers = createConnectionIpcHandlers({ commandBus, eventBus, usbManager });
    ipcRouter.register(connectionContract, connectionHandlers);

    // Register shot ingestion handler: USB data → RecordShot command
    const handleShotIngestion = createShotIngestionHandler({ commandBus, sessionRepository, competitionRepository });
    usbManager.on('data', handleShotIngestion);

    const getReconnectMode = (): Mode => {
      try {
        return sessionContextCache.getContext().mode;
      } catch {
        return Mode.sighting();
      }
    };

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

          usbManager.sendMode(getReconnectMode()).catch((err: unknown) => {
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

    // Subscribe to StageAdvanced events → send mode byte matching stage type
    eventBus.on('StageAdvanced', (event) => {
      const mode = event.scored ? Mode.match() : Mode.sighting();
      usbManager.sendMode(mode).catch((err: unknown) => {
        getLogger().warn('sendMode failed on StageAdvanced', 'main', {
          scored: event.scored,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    });

    // Subscribe to PhaseChanged for initial stage start (IDLE → ACTIVE)
    // StageAdvanced does not fire on startStage(), only on advanceToNextStage()
    eventBus.on('PhaseChanged', (event) => {
      if (event.previousPhase !== 'IDLE' || event.newPhase !== 'ACTIVE') return;
      const mode = event.scored ? Mode.match() : Mode.sighting();
      usbManager.sendMode(mode).catch((err: unknown) => {
        getLogger().warn('sendMode failed on initial PhaseChanged', 'main', {
          scored: event.scored,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    });
  },
};
