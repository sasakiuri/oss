// SPDX-License-Identifier: MIT
import { BrowserWindow, Menu } from 'electron';

import { focusStartupWindow } from '@/main/focusStartupWindow';
import { ContractEventForwarder } from '@/main/shared-infra/ipc';
import { initializeLogger } from '@/main/shared-infra/logging';
import { ModuleLoader } from '@/main/shared-infra/module';
import { scheduleAutoConnect } from '@/main/startup/scheduleAutoConnect';
import { bindMainWindow } from '@/main/window/bindMainWindow';
import { startupContract } from '@/shared/ipc/contracts';

import { bindCompetitionEvents } from './bindCompetitionEvents';
import { createLaneServices, type LaneApplicationPaths } from './createLaneServices';
import { laneModules } from './modules';

/** Composes the service graph, registers features, then binds the Electron window. */
export function createLaneApp(mainWindow: BrowserWindow, paths: LaneApplicationPaths): void {
  const logger = initializeLogger(mainWindow);
  Menu.setApplicationMenu(null);
  logger.info('Application initializing...', 'main');
  logger.debug(`VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL}`, 'main');
  const { registry } = createLaneServices(mainWindow, paths);
  const { eventBus, ipcRouter, startup, timedTargetControl, settingsStore, usbManager, commandBus } = registry;
  const unbindCompetitionEvents = bindCompetitionEvents(eventBus, timedTargetControl);
  new ModuleLoader().load(laneModules, registry);
  let rendererLoaded!: () => void;
  const rendererReady = new Promise<void>((resolve) => {
    rendererLoaded = resolve;
  });
  startup.afterReady(async () => {
    await rendererReady;
    scheduleAutoConnect(settingsStore, usbManager, commandBus, Promise.resolve(await startup.snapshot()));
  });
  const initialize = () => startup.restore();
  const ready = initialize();
  ipcRouter.register(startupContract, {
    getStartupState: async () => {
      await ready;
      return startup.snapshot();
    },
    retryStartup: async () => initialize(),
    setAsideSavedRun: async () => startup.setAsideSavedRun(),
  });

  const appUpdater = bindMainWindow(mainWindow, ipcRouter);
  // 4. Forward domain events to renderer via contract-based channels
  const eventForwarder = new ContractEventForwarder(eventBus, mainWindow);
  eventForwarder.start();
  mainWindow.once('closed', () => {
    unbindCompetitionEvents();
    eventForwarder.stop();
    timedTargetControl.dispose();
  });

  // Run renderer-load initialization from a single did-finish-load hook.
  mainWindow.webContents.once('did-finish-load', () => {
    focusStartupWindow(mainWindow);
    rendererLoaded();
    appUpdater.emitCurrentState();
    void appUpdater.checkForUpdates();
  });
}
