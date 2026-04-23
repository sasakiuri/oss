// SPDX-License-Identifier: MIT
import { existsSync } from 'node:fs';
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
    listPorts: vi.fn().mockResolvedValue([{ path: 'COM9', vendorId: '0403' }]),
    didFinishLoad: null as null | (() => void),
    logger,
  };
});

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
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
    }

    return {
      app: {
        isPackaged: false,
        commandLine: {
          appendSwitch: vi.fn(),
        },
        whenReady: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        getPath: vi.fn(() => '/tmp/saika-lane-user-data'),
        quit: vi.fn(),
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
      get<T>(key: string): T | undefined {
        if (key === 'connectionSettings') {
          return {
            portName: 'COM9',
            manufacturer: 'KOHTO',
            deviceId: 'MT201',
            serialNumber: 'ABC123',
            vendorId: '0403',
            productId: '6001',
          } as T;
        }
        return undefined;
      }
    },
  }));
  if (hasAppSettingsStore) {
    vi.doMock('@/main/modules/settings/infra/AppSettingsStore', () => ({
      AppSettingsStore: class {
        getAll() {
          return {
            connection: {
              portName: 'COM9',
              manufacturer: 'KOHTO',
              deviceId: 'MT201',
              serialNumber: 'ABC123',
              vendorId: '0403',
              productId: '6001',
            },
            userPreferences: {
              laneNumber: 1,
              discipline: null,
              competitionTypeId: '',
              audioVolume: 50,
            },
            mqtt: {
              enabled: false,
              brokerUrl: '',
              laneAlias: '',
              autoConnect: false,
              laneId: '550e8400-e29b-41d4-a716-446655440000',
            },
          };
        }

        getConnectionSettings() {
          return {
            portName: 'COM9',
            manufacturer: 'KOHTO',
            deviceId: 'MT201',
            serialNumber: 'ABC123',
            vendorId: '0403',
            productId: '6001',
          };
        }

        saveConnectionSettings = vi.fn();
      },
    }));
  }
  vi.doMock('@/main/modules/settings/settings.module', () => ({
    settingsModule: { name: 'settings', deps: [], register: vi.fn() },
  }));
  vi.doMock('@/main/modules/target/domain/TargetManufacturer', () => ({
    TargetManufacturer: {
      fromValue: vi.fn((value: string) => value),
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
    TypedEventBus: class {},
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
    return {
      ...actual,
      windowContract: { namespace: 'window' },
    };
  });
}

describe('main.ts auto-connect with partial USB metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMainModuleMocks();
    shared.commandExecute.mockReset();
    shared.commandExecute.mockResolvedValue(undefined);
    shared.listPorts.mockReset();
    shared.listPorts.mockResolvedValue([{ path: 'COM9', vendorId: '0403' }]);
    shared.didFinishLoad = null;
    Object.values(shared.logger).forEach((mockFn) => mockFn.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('still attempts auto-connect when the saved port is present but only partial USB metadata is reported', async () => {
    await import('@/main/main');
    await Promise.resolve();
    await Promise.resolve();

    expect(shared.didFinishLoad).toBeTypeOf('function');

    shared.didFinishLoad?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(shared.commandExecute).toHaveBeenCalledWith(
      { name: 'ConnectToTarget' },
      expect.objectContaining({
        portName: 'COM9',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      }),
    );
  });
});
