// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createElectronMainMock, mockElectronMain, type ElectronMainMock } from '../../helpers/mockElectronMain';
import { mockMainServiceConstruction } from '../../helpers/mockMainServices';

const TARGET_MANUFACTURERS = ['SIUS', 'MEYTON', 'DISAG', 'CUSTOM', 'KOHTO'];

interface SavedConnection {
  portName: string;
  manufacturer: string;
  deviceId: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

interface MainHarnessOptions {
  /** Ports reported by the startup USB scan. */
  ports?: Array<{ path: string; vendorId?: string }>;
  /** Legacy electron-store values read by the real settings store. */
  legacyStorage?: Record<string, unknown>;
  /** Replaces the settings store with one that returns this connection; omit to keep the real store. */
  savedConnection?: SavedConnection | null;
  /** Holds startup restoration until `releaseStartup` is called. */
  deferStartup?: boolean;
}

const commandExecute = vi.fn();
const logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
let userDataPath: string;
let electron: ElectronMainMock;
let releaseStartup: (() => void) | null;

/** Keeps main.ts, window binding and auto-connect real; replaces services and I/O. */
function setupMainHarness({
  ports = [],
  legacyStorage = {},
  savedConnection,
  deferStartup = false,
}: MainHarnessOptions = {}): void {
  // The mock registry outlives vi.resetModules(); drop the per-case replacements of earlier tests.
  vi.doUnmock('@/main/modules/settings/infra/AppSettingsStore');
  vi.doUnmock('@/main/updater/AppUpdater');
  mockMainServiceConstruction();
  mockElectronMain(electron);
  vi.doMock('@/main/startup/restoreActiveRun', () => ({
    ActiveRunStartup: class {
      callbacks: Array<() => Promise<void>> = [];
      afterReady = (callback: () => Promise<void>) => this.callbacks.push(callback);
      snapshot = async () => ({ status: 'READY' });
      restore = vi.fn(() => {
        const runAfterReady = () => {
          for (const callback of this.callbacks) void callback();
        };
        if (!deferStartup) {
          runAfterReady();
          return Promise.resolve({ status: 'READY' });
        }
        return new Promise((resolve) => {
          releaseStartup = () => {
            resolve({ status: 'READY' });
            runAfterReady();
          };
        });
      });
    },
  }));
  vi.doMock('@/main/shared-infra/compat/setupCjsCompat', () => ({}));
  vi.doMock('@/main/composition/tokens', () => ({
    ConnectToTargetToken: { name: 'ConnectToTarget' },
  }));
  vi.doMock('@/main/modules/connection/infra/usb/USBConnectionManager', () => ({
    USBConnectionManager: class {
      on = vi.fn();
      listPorts = vi.fn(async () => ports);
    },
  }));
  vi.doMock('@/main/modules/settings/infra/LocalStorageAdapter', () => ({
    LocalStorageAdapter: class {
      private readonly store = new Map<string, unknown>(Object.entries(legacyStorage));

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
  if (savedConnection !== undefined) {
    vi.doMock('@/main/modules/settings/infra/AppSettingsStore', () => ({
      AppSettingsStore: class {
        getAll() {
          return { connection: savedConnection };
        }

        getConnectionSettings() {
          return savedConnection;
        }

        saveConnectionSettings = vi.fn();
      },
    }));
  }
  // Auto-connect passes the raw value on, so the assertions can compare plain strings.
  vi.doMock('@/main/modules/target/domain/TargetManufacturer', () => ({
    TargetManufacturer: {
      fromValue: vi.fn((value: string) => {
        if (!TARGET_MANUFACTURERS.includes(value)) {
          throw new Error(`Invalid manufacturer: ${value}`);
        }
        return value;
      }),
    },
  }));
  vi.doMock('@/main/shared-infra/cqrs', () => ({
    CommandBus: class {
      execute = commandExecute;
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
    getLogger: () => logger,
    initializeLogger: () => logger,
  }));
  vi.doMock('@/main/shared-infra/module', () => ({
    ModuleLoader: class {
      load = vi.fn();
    },
  }));
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function startMain(): Promise<void> {
  await import('@/main/main');
  await flushMicrotasks();
}

async function finishRendererLoad(): Promise<void> {
  expect(electron.didFinishLoad).toBeTypeOf('function');

  electron.didFinishLoad?.();
  await flushMicrotasks();
}

async function expectAutoConnect(connection: Record<string, unknown>): Promise<void> {
  await vi.waitFor(() =>
    expect(commandExecute).toHaveBeenCalledWith({ name: 'ConnectToTarget' }, expect.objectContaining(connection)),
  );
}

beforeEach(() => {
  vi.resetModules();
  userDataPath = mkdtempSync(join(tmpdir(), 'saika-lane-main-'));
  electron = createElectronMainMock(userDataPath);
  releaseStartup = null;
  commandExecute.mockReset();
  commandExecute.mockResolvedValue(undefined);
  Object.values(logger).forEach((mockFn) => mockFn.mockReset());
});

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true });
});

describe('main.ts auto-connect regression', () => {
  it.each([
    { manufacturer: 'KOHTO', deviceId: 'BPT216', baudRate: 115200 },
    { manufacturer: 'DISAG', deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE', baudRate: 9600 },
  ])('waits for READY before auto-connecting $deviceId', async ({ manufacturer, deviceId, baudRate }) => {
    setupMainHarness({ savedConnection: { portName: 'COM9', manufacturer, deviceId }, deferStartup: true });
    await startMain();
    await finishRendererLoad();

    expect(commandExecute).not.toHaveBeenCalled();

    releaseStartup?.();
    await flushMicrotasks();

    await expectAutoConnect({ portName: 'COM9', manufacturer, deviceId, baudRate });
  });
});

async function expectLegacyStorageAutoConnect(settingsDocument: string): Promise<void> {
  writeFileSync(join(userDataPath, 'settings.json'), settingsDocument, 'utf8');
  setupMainHarness({
    legacyStorage: { connectionSettings: { portName: 'COM9', manufacturer: 'KOHTO', deviceId: 'MT201' } },
  });
  await startMain();
  await finishRendererLoad();

  await expectAutoConnect({ portName: 'COM9', manufacturer: 'KOHTO', deviceId: 'MT201' });
}

describe('main.ts auto-connect with empty settings document', () => {
  it('still attempts auto-connect from legacy storage when settings.json exists but lacks saved sections', () =>
    expectLegacyStorageAutoConnect('{}\n'));
});

describe('main.ts auto-connect with partial settings document', () => {
  it('still attempts auto-connect from legacy storage when the persisted connection section is incomplete', () =>
    expectLegacyStorageAutoConnect(JSON.stringify({ connection: { portName: 'COM9' } }, null, 2)));
});

describe('main.ts auto-connect with missing legacy manufacturer', () => {
  it('does not attempt auto-connect when the saved legacy manufacturer is missing', async () => {
    setupMainHarness({ legacyStorage: { connectionSettings: { portName: 'COM9', deviceId: 'MT201' } } });
    const { AppSettingsStore } = await import('@/main/modules/settings/infra/AppSettingsStore');
    const { LocalStorageAdapter } = await import('@/main/modules/settings/infra/LocalStorageAdapter');
    const storage = new LocalStorageAdapter({ name: 'saika-lane' });
    const settingsStore = new AppSettingsStore({
      filePath: join(userDataPath, 'settings.json'),
      storage,
    });

    expect(settingsStore.getConnectionSettings()).toBeNull();

    await startMain();
    await finishRendererLoad();

    expect(commandExecute).not.toHaveBeenCalled();
  });
});

describe('main.ts auto-connect with partial USB metadata', () => {
  it('still attempts auto-connect when the saved port is present but only partial USB metadata is reported', async () => {
    setupMainHarness({
      ports: [{ path: 'COM9', vendorId: '0403' }],
      savedConnection: {
        portName: 'COM9',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
    });
    await startMain();
    await finishRendererLoad();

    await expectAutoConnect({ portName: 'COM9', manufacturer: 'KOHTO', deviceId: 'MT201' });
  });
});

describe('main.ts updater close confirmation handling', () => {
  it('re-enables normal close confirmation after a skipped updater close attempt', async () => {
    const updater = { beforeQuitForInstall: null as null | (() => void) };
    setupMainHarness({ savedConnection: null });
    vi.doMock('@/main/updater/AppUpdater', () => ({
      AppUpdater: class {
        constructor(options: { onBeforeQuitForInstall?: () => void }) {
          updater.beforeQuitForInstall = options.onBeforeQuitForInstall ?? null;
        }

        emitCurrentState = vi.fn();
        checkForUpdates = vi.fn(async () => undefined);
      },
    }));
    await startMain();

    expect(updater.beforeQuitForInstall).toBeTypeOf('function');
    expect(electron.closeHandler).toBeTypeOf('function');

    updater.beforeQuitForInstall?.();

    const firstCloseEvent = { preventDefault: vi.fn() };
    electron.closeHandler?.(firstCloseEvent);

    expect(firstCloseEvent.preventDefault).not.toHaveBeenCalled();
    expect(electron.showMessageBox).not.toHaveBeenCalled();

    const secondCloseEvent = { preventDefault: vi.fn() };
    electron.closeHandler?.(secondCloseEvent);
    await Promise.resolve();

    expect(secondCloseEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(electron.showMessageBox).toHaveBeenCalledTimes(1);
  });
});
