// SPDX-License-Identifier: MIT
/**
 * Connection module definition
 *
 * Registers command handlers and IPC handlers for target connection management.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
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

    // Register CQRS handlers
    commandBus.register(ConnectToTargetToken, createConnectToTargetHandler(connectionRepository, usbManager, eventBus));
    commandBus.register(
      DisconnectFromTargetToken,
      createDisconnectFromTargetHandler(connectionRepository, usbManager, eventBus),
    );

    // Register IPC handlers via IpcRouter
    const connectionHandlers = createConnectionIpcHandlers({ commandBus, eventBus, usbManager });
    ipcRouter.register(connectionContract, connectionHandlers);

    // Register shot ingestion handler: USB data → RecordShot command
    const handleShotIngestion = createShotIngestionHandler({ commandBus, sessionRepository, competitionRepository });
    usbManager.on('data', handleShotIngestion);

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
