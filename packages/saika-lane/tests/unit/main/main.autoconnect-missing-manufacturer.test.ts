// SPDX-License-Identifier: MIT
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    commandExecute: vi.fn().mockResolvedValue(undefined),
    listPorts: vi.fn().mockResolvedValue([]),
    didFinishLoad: null as null | (() => void),
    logger,
  };
});

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const userDataPath = join(packageRoot, '.tmp-autoconnect-missing-manufacturer');
const hasCreateMainWindowOptions = existsSync(join(packageRoot, 'src/main/createMainWindowOptions.ts'));
const hasAppSettingsStore = existsSync(join(packageRoot, 'src/main/modules/settings/infra/AppSettingsStore.ts'));

function setupMainModuleMocks(): void {
  vi.doMock('@/main/shared-infra/compat/setupCjsCompat', () => ({}));

  vi.doMock('electron', () => {
    class BrowserWindow {
      webContents = {
        on: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'did-finish-load') {
            shared.didFinishLoad = callback;
          }
        }),
        setWindowOpenHandler: vi.fn(),
        openDevTools: vi.fn(),
        send: vi.fn(),
      };

      loadURL = vi.fn();
      loadFile = vi.fn();
      on = vi.fn();
      close = vi.fn();
      destroy = vi.fn();
      minimize = vi.fn();
      maximize = vi.fn();
      unmaximize = vi.fn();
      isMaximized = vi.fn(() => false);
      setFullScreen = vi.fn();
      isFullScreen = vi.fn(() => false);
      isDestroyed = vi.fn(() => false);
      isMinimized = vi.fn(() => false);
      restore = vi.fn();
      show = vi.fn();
      focus = vi.fn();
      isFocused = vi.fn(() => true);
      moveTop = vi.fn();
      setAlwaysOnTop = vi.fn();
    }

    return {
      app: {
        isPackaged: false,
        commandLine: {
          appendSwitch: vi.fn(),
        },
        whenReady: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        getPath: vi.fn(() => userDataPath),
        quit: vi.fn(),
        focus: vi.fn(),
      },
      BrowserWindow,
      dialog: {
        showMessageBox: vi.fn(),
      },
      Menu: {
        setApplicationMenu: vi.fn(),
      },
    };
  });

  vi.doMock('@/main/composition/tokens', () => ({
    ConnectToTargetToken: { name: 'ConnectToTarget' },
  }));

  if (hasCreateMainWindowOptions) {
    vi.doMock('@/main/createMainWindowOptions', () => ({
      createMainWindowOptions: vi.fn(() => ({
        width: 1280,
        height: 800,
        frame: false,
        webPreferences: {},
      })),
    }));
  }

  vi.doMock('@/main/modules/competition/competition.module', () => ({
    competitionModule: { name: 'competition', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/modules/competition/infra/CompetitionRepositoryImpl', () => ({
    CompetitionRepositoryImpl: class {},
  }));
  vi.doMock('@/main/modules/competition/infra/LaneTimerService', () => ({
    LaneTimerService: class {},
  }));
  vi.doMock('@/main/modules/connection/connection.module', () => ({
    connectionModule: { name: 'connection', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/modules/connection/infra/ConnectionRepositoryImpl', () => ({
    ConnectionRepositoryImpl: class {},
  }));
  vi.doMock('@/main/modules/connection/infra/usb/USBConnectionManager', () => ({
    USBConnectionManager: class {
      on = vi.fn();
      listPorts = shared.listPorts;
    },
  }));
  vi.doMock('@/main/modules/mqtt/mqtt.module', () => ({
    mqttModule: { name: 'mqtt', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/modules/report/infra/PrintWindowService', () => ({
    PrintWindowService: class {},
  }));
  vi.doMock('@/main/modules/report/report.module', () => ({
    reportModule: { name: 'report', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/modules/session/infra/SqliteSessionRepository', () => ({
    SqliteSessionRepository: class {},
  }));
  vi.doMock('@/main/modules/session/session.module', () => ({
    sessionModule: { name: 'session', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/modules/settings/infra/LocalStorageAdapter', () => ({
    LocalStorageAdapter: class {
      private readonly store = new Map<string, unknown>([
        [
          'connectionSettings',
          {
            portName: 'COM9',
            deviceId: 'MT201',
          },
        ],
      ]);

      get<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
      }

      set(key: string, value: unknown): void {
        this.store.set(key, value);
      }

      has(key: string): boolean {
        return this.store.has(key);
      }

      delete(key: string): void {
        this.store.delete(key);
      }
    },
  }));
  vi.doMock('@/main/modules/settings/settings.module', () => ({
    settingsModule: { name: 'settings', deps: [], register: vi.fn() },
  }));
  if (hasAppSettingsStore) {
    vi.doMock('@/main/modules/settings/infra/AppSettingsStore', async () => {
      const actual = await vi.importActual<typeof import('@/main/modules/settings/infra/AppSettingsStore')>(
        '@/main/modules/settings/infra/AppSettingsStore',
      );
      return actual;
    });
  }
  vi.doMock('@/main/modules/target/domain/TargetManufacturer', () => ({
    TargetManufacturer: {
      fromValue: vi.fn((value: string) => {
        if (value !== 'KOHTO') {
          throw new Error(`Invalid manufacturer: ${value}`);
        }
        return value;
      }),
    },
  }));
  vi.doMock('@/main/modules/target/infra/AdapterRegistry', () => ({
    AdapterRegistry: class {},
  }));
  vi.doMock('@/main/modules/target/target.module', () => ({
    targetModule: { name: 'target', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/shared-infra/cqrs', () => ({
    CommandBus: class {
      execute = shared.commandExecute;
      use = vi.fn();
    },
    QueryBus: class {
      use = vi.fn();
    },
    CommandLoggingMiddleware: class {},
    QueryLoggingMiddleware: class {},
  }));
  vi.doMock('@/main/shared-infra/events/TypedEventBus', () => ({
    TypedEventBus: class {
      on = vi.fn(() => () => undefined);
    },
  }));
  vi.doMock('@/main/shared-infra/ipc', () => ({
    ContractEventForwarder: class {
      start = vi.fn();
    },
  }));
  vi.doMock('@/main/shared-infra/ipc/IpcRouter', () => ({
    IpcRouter: class {
      register = vi.fn();
    },
  }));
  vi.doMock('@/main/shared-infra/logging', () => ({
    getLogger: () => shared.logger,
    initializeLogger: () => shared.logger,
  }));
  vi.doMock('@/main/shared-infra/module', () => ({
    ModuleLoader: class {
      load = vi.fn();
    },
  }));
  vi.doMock('@/main/shared-infra/sqlite/SqliteDb', () => ({
    createSqliteDb: vi.fn(() => ({})),
  }));
  vi.doMock('@/shared/ipc/contracts', async () => {
    const actual = await vi.importActual<typeof import('@/shared/ipc/contracts')>('@/shared/ipc/contracts');
    return actual;
  });
}

describe('main.ts auto-connect with missing legacy manufacturer', () => {
  beforeEach(() => {
    vi.resetModules();
    rmSync(userDataPath, { recursive: true, force: true });
    setupMainModuleMocks();
    shared.commandExecute.mockReset();
    shared.commandExecute.mockResolvedValue(undefined);
    shared.listPorts.mockReset();
    shared.listPorts.mockResolvedValue([]);
    shared.didFinishLoad = null;
    Object.values(shared.logger).forEach((mockFn) => mockFn.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('does not attempt auto-connect when the saved legacy manufacturer is missing', async () => {
    if (hasAppSettingsStore) {
      const { AppSettingsStore } = await import('@/main/modules/settings/infra/AppSettingsStore');
      const { LocalStorageAdapter } = await import('@/main/modules/settings/infra/LocalStorageAdapter');
      const storage = new LocalStorageAdapter({ name: 'saika-lane' });
      const settingsStore = new AppSettingsStore({
        filePath: join(userDataPath, 'settings.json'),
        storage,
      });

      expect(settingsStore.getConnectionSettings()).toBeNull();
    }

    await import('@/main/main');
    await Promise.resolve();
    await Promise.resolve();

    expect(shared.didFinishLoad).toBeTypeOf('function');

    shared.didFinishLoad?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(shared.commandExecute).not.toHaveBeenCalled();
  });
});
