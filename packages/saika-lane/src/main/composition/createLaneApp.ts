// SPDX-License-Identifier: MIT
import { BrowserWindow, Menu } from 'electron';

import { focusStartupWindow } from '@/main/focusStartupWindow';
import { ContractEventForwarder } from '@/main/shared-infra/ipc';
import { initializeLogger } from '@/main/shared-infra/logging';
import { ModuleLoader } from '@/main/shared-infra/module';
import { scheduleAutoConnect } from '@/main/startup/scheduleAutoConnect';
import { bindMainWindow } from '@/main/window/bindMainWindow';

import { bindCompetitionEvents } from './bindCompetitionEvents';
import { createLaneServices, type LaneApplicationPaths } from './createLaneServices';
import { laneModules } from './modules';

/** Composes the service graph, registers features, then binds the Electron window. */
export function createLaneApp(mainWindow: BrowserWindow, paths: LaneApplicationPaths): void {
  const logger = initializeLogger(mainWindow);
  Menu.setApplicationMenu(null);
  logger.info('Application initializing...', 'main');
  logger.debug(`VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL}`, 'main');
  const { registry, firstSessionStarted } = createLaneServices(mainWindow, paths);
  const {
    eventBus,
    ipcRouter,
    safetyStopControl,
    timerService,
    competitionInterruptionControl,
    timedTargetControl,
    qualificationRecoveryControl,
    settingsStore,
    usbManager,
    commandBus,
  } = registry;
  const unbindCompetitionEvents = bindCompetitionEvents(eventBus, timedTargetControl);
  new ModuleLoader().load(laneModules, registry);
  void (async () => {
    if (safetyStopControl.isStopped()) {
      timerService.stop();
      logger.warn('[LaneSafetyStopService] Active safety latch restored; timer recovery remains blocked', 'domain', {
        safetyStopId: safetyStopControl.getState()?.safetyStopId,
      });
      return;
    }
    await competitionInterruptionControl.restoreActive();
  })().catch((error: unknown) => {
    logger.error('[CompetitionInterruptionService] Failed to restore interruption state', 'domain', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const appUpdater = bindMainWindow(mainWindow, ipcRouter);
  // 4. Forward domain events to renderer via contract-based channels
  const eventForwarder = new ContractEventForwarder(eventBus, mainWindow);
  eventForwarder.start();
  timedTargetControl.restore();
  qualificationRecoveryControl.restoreActive();
  mainWindow.once('closed', () => {
    unbindCompetitionEvents();
    eventForwarder.stop();
    timedTargetControl.dispose();
  });

  // Run renderer-load initialization from a single did-finish-load hook.
  mainWindow.webContents.once('did-finish-load', () => {
    focusStartupWindow(mainWindow);
    scheduleAutoConnect(settingsStore, usbManager, commandBus, firstSessionStarted);
    appUpdater.emitCurrentState();
    void appUpdater.checkForUpdates();
  });
}
