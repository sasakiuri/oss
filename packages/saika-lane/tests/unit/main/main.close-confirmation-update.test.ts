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
    beforeQuitForInstall: null as null | (() => void),
    closeHandler: null as null | ((event: { preventDefault: () => void }) => void),
    didFinishLoad: null as null | (() => void),
    dialogShowMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
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
    on = vi.fn((event: string, callback: (event: { preventDefault: () => void }) => void) => {
      if (event === 'close') {
        shared.closeHandler = callback;
      }
    });
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
      showMessageBox: shared.dialogShowMessageBox,
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
    listPorts = vi.fn().mockResolvedValue([]);
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
        connection: null,
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
      return null;
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
    execute = vi.fn().mockResolvedValue(undefined);
    use = vi.fn();
  },
  QueryBus: class {
    use = vi.fn();
  },
  CommandLoggingMiddleware: class {},
  QueryLoggingMiddleware: class {},
}));
vi.mock('@/main/shared-infra/events/TypedEventBus', () => ({
  TypedEventBus: class {
    on = vi.fn(() => () => undefined);
  },
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
vi.mock('@/main/updater/AppUpdater', () => ({
  AppUpdater: class {
    constructor(options: { onBeforeQuitForInstall?: () => void }) {
      shared.beforeQuitForInstall = options.onBeforeQuitForInstall ?? null;
    }

    getState = vi.fn(() => ({
      status: 'idle',
      currentVersion: '0.2.1',
      targetVersion: null,
      releaseName: null,
      releaseDate: null,
      releaseNotes: null,
      downloadPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      lastCheckedAt: null,
      errorMessage: null,
      canCheckForUpdates: true,
      canInstallUpdate: false,
    }));

    emitCurrentState = vi.fn();
    checkForUpdates = vi.fn(async () => this.getState());
    quitAndInstall = vi.fn(async () => undefined);
  },
}));
vi.mock('@/shared/ipc/contracts', async () => {
  const actual = await vi.importActual<typeof import('@/shared/ipc/contracts')>('@/shared/ipc/contracts');
  return {
    ...actual,
    windowContract: { namespace: 'window' },
  };
});

describe('main.ts updater close confirmation handling', () => {
  beforeEach(() => {
    vi.resetModules();
    shared.beforeQuitForInstall = null;
    shared.closeHandler = null;
    shared.didFinishLoad = null;
    shared.dialogShowMessageBox.mockClear();
    Object.values(shared.logger).forEach((mockFn) => mockFn.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('re-enables normal close confirmation after a skipped updater close attempt', async () => {
    await import('@/main/main');
    await Promise.resolve();
    await Promise.resolve();

    expect(shared.beforeQuitForInstall).toBeTypeOf('function');
    expect(shared.closeHandler).toBeTypeOf('function');

    shared.beforeQuitForInstall?.();

    const firstCloseEvent = { preventDefault: vi.fn() };
    shared.closeHandler?.(firstCloseEvent);

    expect(firstCloseEvent.preventDefault).not.toHaveBeenCalled();
    expect(shared.dialogShowMessageBox).not.toHaveBeenCalled();

    const secondCloseEvent = { preventDefault: vi.fn() };
    shared.closeHandler?.(secondCloseEvent);
    await Promise.resolve();

    expect(secondCloseEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(shared.dialogShowMessageBox).toHaveBeenCalledTimes(1);
  });
});
