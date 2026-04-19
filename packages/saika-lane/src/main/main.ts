// SPDX-License-Identifier: MIT
import '@/main/shared-infra/compat/setupCjsCompat';

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow, dialog, Menu } from 'electron';

import { ConnectToTargetToken } from '@/main/composition/tokens';
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
import { CommandBus, CommandLoggingMiddleware, QueryBus, QueryLoggingMiddleware } from '@/main/shared-infra/cqrs';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ContractEventForwarder } from '@/main/shared-infra/ipc';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { getLogger, initializeLogger } from '@/main/shared-infra/logging';
import { ModuleLoader } from '@/main/shared-infra/module';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { windowContract } from '@/shared/ipc/contracts';

const appDir = dirname(fileURLToPath(import.meta.url));

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    webPreferences: {
      preload: join(appDir, '../preload/preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

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
      window.webContents.openDevTools();
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
      return { isMaximized: mainWindow.isMaximized() };
    },
    close: async () => {
      mainWindow.close();
    },
    getWindowState: async () => ({
      isMaximized: mainWindow.isMaximized(),
    }),
  });

  // 4. Forward domain events to renderer via contract-based channels
  const eventForwarder = new ContractEventForwarder(eventBus, mainWindow);
  eventForwarder.start();

  // Auto-connect on renderer load
  scheduleAutoConnect(mainWindow, settingsStore, commandBus);

  // 5. Register close confirmation dialog
  mainWindow.on('close', (event) => {
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
  mainWindow: BrowserWindow,
  settingsStore: IAppSettingsStore,
  commandBus: CommandBus,
): void {
  mainWindow.webContents.once('did-finish-load', () => {
    const logger = getLogger();
    const settings = settingsStore.getConnectionSettings();

    if (!settings) {
      logger.info('Auto-connect: no saved connection settings found, skipping.', 'main');
      return;
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
  });
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
