// SPDX-License-Identifier: MIT
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

vi.mock('@/main/shared-infra/compat/setupCjsCompat', () => ({}));

vi.mock('electron', () => {
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
      getPath: vi.fn(() => '/tmp/saika-lane-user-data'),
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

vi.mock('@/main/composition/tokens', () => ({
  ConnectToTargetToken: { name: 'ConnectToTarget' },
}));

vi.mock('@/main/createMainWindowOptions', () => ({
  createMainWindowOptions: vi.fn(() => ({
    width: 1280,
    height: 800,
    frame: false,
    webPreferences: {},
  })),
}));

vi.mock('@/main/modules/competition/competition.module', () => ({
  competitionModule: { name: 'competition', deps: [], register: vi.fn() },
}));
vi.mock('@/main/modules/competition/infra/CompetitionRepositoryImpl', () => ({
  CompetitionRepositoryImpl: class {},
}));
vi.mock('@/main/modules/competition/infra/LaneTimerService', () => ({
  LaneTimerService: class {},
}));
vi.mock('@/main/modules/connection/connection.module', () => ({
  connectionModule: { name: 'connection', deps: [], register: vi.fn() },
}));
vi.mock('@/main/modules/connection/infra/ConnectionRepositoryImpl', () => ({
  ConnectionRepositoryImpl: class {},
}));
vi.mock('@/main/modules/connection/infra/usb/USBConnectionManager', () => ({
  USBConnectionManager: class {
    on = vi.fn();
    listPorts = shared.listPorts;
  },
}));
vi.mock('@/main/modules/mqtt/mqtt.module', () => ({
  mqttModule: { name: 'mqtt', deps: [], register: vi.fn() },
}));
vi.mock('@/main/modules/report/infra/PrintWindowService', () => ({
  PrintWindowService: class {},
}));
vi.mock('@/main/modules/report/report.module', () => ({
  reportModule: { name: 'report', deps: [], register: vi.fn() },
}));
vi.mock('@/main/modules/session/infra/SqliteSessionRepository', () => ({
  SqliteSessionRepository: class {},
}));
vi.mock('@/main/modules/session/session.module', () => ({
  sessionModule: { name: 'session', deps: [], register: vi.fn() },
}));
vi.mock('@/main/modules/settings/infra/AppSettingsStore', () => ({
  AppSettingsStore: class {
    getAll() {
      return {
        connection: {
          portName: 'COM9',
          manufacturer: 'KOHTO',
          deviceId: 'MT201',
          serialNumber: '',
          vendorId: '',
          productId: '',
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
      };
    }

    saveConnectionSettings = vi.fn();
  },
}));
vi.mock('@/main/modules/settings/infra/LocalStorageAdapter', () => ({
  LocalStorageAdapter: class {},
}));
vi.mock('@/main/modules/settings/settings.module', () => ({
  settingsModule: { name: 'settings', deps: [], register: vi.fn() },
}));
vi.mock('@/main/modules/target/domain/TargetManufacturer', () => ({
  TargetManufacturer: {
    fromValue: vi.fn((value: string) => value),
  },
}));
vi.mock('@/main/modules/target/infra/AdapterRegistry', () => ({
  AdapterRegistry: class {},
}));
vi.mock('@/main/modules/target/target.module', () => ({
  targetModule: { name: 'target', deps: [], register: vi.fn() },
}));
vi.mock('@/main/resolveAutoConnectSettings', () => ({
  resolveAutoConnectSettings: vi.fn(() => null),
}));
vi.mock('@/main/shared-infra/cqrs', () => ({
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
vi.mock('@/main/shared-infra/events/TypedEventBus', () => ({
  TypedEventBus: class {},
}));
vi.mock('@/main/shared-infra/ipc', () => ({
  ContractEventForwarder: class {
    start = vi.fn();
  },
}));
vi.mock('@/main/shared-infra/ipc/IpcRouter', () => ({
  IpcRouter: class {
    register = vi.fn();
  },
}));
vi.mock('@/main/shared-infra/logging', () => ({
  getLogger: () => shared.logger,
  initializeLogger: () => shared.logger,
}));
vi.mock('@/main/shared-infra/module', () => ({
  ModuleLoader: class {
    load = vi.fn();
  },
}));
vi.mock('@/main/shared-infra/sqlite/SqliteDb', () => ({
  createSqliteDb: vi.fn(() => ({})),
}));
vi.mock('@/shared/ipc/contracts', async () => {
  const actual = await vi.importActual<typeof import('@/shared/ipc/contracts')>('@/shared/ipc/contracts');
  return {
    ...actual,
    windowContract: { namespace: 'window' },
  };
});

describe('main.ts auto-connect regression', () => {
  beforeEach(() => {
    vi.resetModules();
    shared.commandExecute.mockReset();
    shared.commandExecute.mockResolvedValue(undefined);
    shared.listPorts.mockReset();
    shared.listPorts.mockResolvedValue([]);
    shared.didFinishLoad = null;
    Object.values(shared.logger).forEach((mockFn) => mockFn.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('attempts auto-connect when saved settings exist even if the initial port scan is empty', async () => {
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
