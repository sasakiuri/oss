// SPDX-License-Identifier: MIT
import '@/main/shared-infra/compat/setupCjsCompat';

import { release } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow, dialog, Menu } from 'electron';

import { ConnectToTargetToken } from '@/main/composition/tokens';
import { createMainWindowOptions } from '@/main/createMainWindowOptions';
import { competitionModule } from '@/main/modules/competition/competition.module';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { connectionModule } from '@/main/modules/connection/connection.module';
import { ConnectionRepositoryImpl } from '@/main/modules/connection/infra/ConnectionRepositoryImpl';
import { USBConnectionManager } from '@/main/modules/connection/infra/usb/USBConnectionManager';
import { mqttModule } from '@/main/modules/mqtt/mqtt.module';
import { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import { reportModule } from '@/main/modules/report/report.module';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { sessionModule } from '@/main/modules/session/session.module';
import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';
import type { IAppSettingsStore } from '@/main/modules/settings/infra/IAppSettingsStore';
import { LocalStorageAdapter } from '@/main/modules/settings/infra/LocalStorageAdapter';
import { settingsModule } from '@/main/modules/settings/settings.module';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { targetModule } from '@/main/modules/target/target.module';
import { resolveAutoConnectSettings } from '@/main/resolveAutoConnectSettings';
import { CommandBus, CommandLoggingMiddleware, QueryBus, QueryLoggingMiddleware } from '@/main/shared-infra/cqrs';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ContractEventForwarder } from '@/main/shared-infra/ipc';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { getLogger, initializeLogger } from '@/main/shared-infra/logging';
import { ModuleLoader } from '@/main/shared-infra/module';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { AppUpdater } from '@/main/updater/AppUpdater';
import { eventsContract, updaterContract, windowContract } from '@/shared/ipc/contracts';

const appDir = dirname(fileURLToPath(import.meta.url));
const isWsl =
  process.platform === 'linux' &&
  (Boolean(process.env.WSL_DISTRO_NAME) || release().toLowerCase().includes('microsoft'));
process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME = isWsl ? '1' : '0';

if (isWsl) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow(
    createMainWindowOptions({
      isPackaged: app.isPackaged,
      preloadPath: join(appDir, '../preload/preload.mjs'),
      useNativeWindowFrame: isWsl,
    }),
  );

  // Capture renderer console.log and write to file
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const logMessage = `[renderer:${level}] ${message} (${sourceId}:${line})`;
    getLogger().debug(logMessage, 'renderer');
  });

  // Security: prevent navigation to external URLs
  window.webContents.on('will-navigate', (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const isDevUrl = !app.isPackaged && devServerUrl != null && url.startsWith(devServerUrl);
    const isAllowedUrl = url.startsWith('file://') || isDevUrl;
    if (!isAllowedUrl) {
      event.preventDefault();
    }
  });

  // Security: block all new window requests
  window.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (!app.isPackaged && process.env.OPEN_DEVTOOLS !== '0' && process.env.OPEN_DEVTOOLS !== 'false') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    window.loadFile(join(appDir, '../renderer/index.html'));
  }

  return window;
}

/**
 * Initialize application dependencies and setup IPC
 *
 * @description
 * Initializes the complete application stack:
 * 1. Creates infrastructure layer components (repositories, services, etc.)
 * 2. Creates application layer components (command bus, query bus)
 * 3. Loads modules via ModuleLoader (registers all command/query handlers)
 * 4. Registers USB data handler
 * 5. Starts domain event forwarding to renderer
 *
 * This function follows the dependency injection pattern and ensures
 * proper initialization order of all components.
 *
 * @param mainWindow - Main browser window for IPC communication
 */
function initializeApplication(mainWindow: BrowserWindow): void {
  let skipCloseConfirmation = false;

  // 0. Initialize Logger (first to enable logging for all subsequent operations)
  const logger = initializeLogger(mainWindow);
  Menu.setApplicationMenu(null);
  logger.info('Application initializing...', 'main');
  logger.debug(`VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL}`, 'main');

  // 1. Create infrastructure components
  const storage = new LocalStorageAdapter({ name: 'saika-lane' });
  const settingsStore = new AppSettingsStore({
    filePath: join(app.getPath('userData'), 'settings.json'),
    storage,
  });
  settingsStore.getAll();
  const eventBus = new TypedEventBus();
  const db = createSqliteDb(join(app.getPath('userData'), 'saika-lane.db'));
  const sessionRepository = new SqliteSessionRepository(db);
  const connectionRepository = new ConnectionRepositoryImpl(storage);
  const competitionRepository = new CompetitionRepositoryImpl(storage);
  const printWindowService = new PrintWindowService(
    join(appDir, '../preload/preload.mjs'),
    join(appDir, '../renderer'),
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
  const appUpdater = new AppUpdater({
    mainWindow,
    onBeforeQuitForInstall: () => {
      skipCloseConfirmation = true;
    },
  });

  // Add middleware
  commandBus.use(new CommandLoggingMiddleware());
  queryBus.use(new QueryLoggingMiddleware());

  // 3. Load modules (registers all command/query handlers)
  const timerService = new LaneTimerService(competitionRepository, eventBus);
  const loader = new ModuleLoader();
  loader.load(
    [targetModule, sessionModule, connectionModule, settingsModule, competitionModule, reportModule, mqttModule],
    {
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
      mainWindow,
      userDataPath: app.getPath('userData'),
    },
  );

  // 3.1 Register window operation handlers
  ipcRouter.register(windowContract, {
    toggleFullscreen: async () => {
      const next = !mainWindow.isFullScreen();
      mainWindow.setFullScreen(next);
      return { isFullscreen: next };
    },
    minimize: async () => {
      mainWindow.minimize();
    },
    maximize: async () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return {
        isMaximized: mainWindow.isMaximized(),
        isFullscreen: mainWindow.isFullScreen(),
      };
    },
    close: async () => {
      mainWindow.close();
    },
    getWindowState: async () => ({
      isMaximized: mainWindow.isMaximized(),
      isFullscreen: mainWindow.isFullScreen(),
    }),
  });

  ipcRouter.register(updaterContract, {
    getUpdateState: async () => appUpdater.getState(),
    checkForUpdates: async () => appUpdater.checkForUpdates(),
    quitAndInstall: async () => {
      await appUpdater.quitAndInstall();
    },
  });

  const sendFullscreenChanged = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(eventsContract.channels.fullscreenChanged, {
      isFullscreen: mainWindow.isFullScreen(),
    });
  };

  mainWindow.on('enter-full-screen', sendFullscreenChanged);
  mainWindow.on('leave-full-screen', sendFullscreenChanged);

  // 4. Forward domain events to renderer via contract-based channels
  const eventForwarder = new ContractEventForwarder(eventBus, mainWindow);
  eventForwarder.start();

  // Run renderer-load initialization from a single did-finish-load hook.
  mainWindow.webContents.once('did-finish-load', () => {
    scheduleAutoConnect(settingsStore, usbConnectionManager, commandBus);
    appUpdater.emitCurrentState();
    void appUpdater.checkForUpdates();
  });

  // 5. Register close confirmation dialog
  mainWindow.on('close', (event) => {
    if (skipCloseConfirmation) {
      skipCloseConfirmation = false;
      return;
    }

    event.preventDefault();
    dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Quit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit the application?',
      })
      .then(({ response }) => {
        if (response === 0) {
          mainWindow.destroy();
        }
      });
  });
}

function scheduleAutoConnect(
  settingsStore: IAppSettingsStore,
  usbManager: USBConnectionManager,
  commandBus: CommandBus,
): void {
  void (async () => {
    const logger = getLogger();
    let settings = settingsStore.getConnectionSettings();

    if (!settings) {
      logger.info('Auto-connect: no saved connection settings found, skipping.', 'main');
      return;
    }

    try {
      const ports = await usbManager.listPorts();
      const resolvedSettings = resolveAutoConnectSettings(settings, ports);

      if (!resolvedSettings) {
        if (ports.length === 0) {
          logger.warn('Auto-connect: current port scan returned no ports, falling back to saved port.', 'main', {
            savedPortName: settings.portName,
          });
        } else {
          logger.warn('Auto-connect: saved device could not be resolved among current ports, skipping.', 'main', {
            savedPortName: settings.portName,
            serialNumber: settings.serialNumber,
            vendorId: settings.vendorId,
            productId: settings.productId,
          });
          return;
        }
      } else if (resolvedSettings.shouldPersist) {
        const previousPortName = settings.portName;
        settings = resolvedSettings.settings;
        settingsStore.saveConnectionSettings(settings);
        logger.info('Auto-connect: refreshed saved device settings from current ports.', 'main', {
          previousPortName,
          resolvedPortName: resolvedSettings.settings.portName,
          matchedBy: resolvedSettings.resolvedPort.matchedBy,
          identityUpdated: resolvedSettings.identityUpdated,
        });
      } else {
        settings = resolvedSettings.settings;
      }
    } catch (err) {
      logger.warn('Auto-connect: failed to inspect current ports, falling back to saved port.', 'main', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let manufacturer: TargetManufacturer;
    try {
      manufacturer = TargetManufacturer.fromValue(settings.manufacturer);
    } catch (err) {
      logger.warn('Auto-connect: invalid manufacturer in saved settings, skipping.', 'main', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    logger.info(`Auto-connect: attempting connection to ${settings.portName} (${settings.manufacturer})`, 'main');

    commandBus
      .execute(ConnectToTargetToken, {
        portName: settings.portName,
        manufacturer,
        deviceId: settings.deviceId,
      })
      .then(() => {
        logger.info('Auto-connect: connection established successfully.', 'main');
      })
      .catch((err: unknown) => {
        logger.warn('Auto-connect: connection failed, manual connection required.', 'main', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  })();
}

// Relax autoplay policy (required for impact sound playback)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('audio-buffer-size', '128');

// Quit on all platforms when all windows are closed.
// macOS dock reactivation (the `activate` event) requires proper window lifecycle
// management — rebinding IPC handlers, event forwarding, and window controls to the
// new window — which will be implemented in a future version.
app.whenReady().then(() => {
  const window = createWindow();
  initializeApplication(window);
});

app.on('window-all-closed', () => {
  app.quit();
});
