// SPDX-License-Identifier: MIT
import { vi, type Mock } from 'vitest';

import { eventsContract, sessionContract } from '@/shared/ipc/contracts';
import { laneBridgeContracts } from '@/shared/ipc/laneBridgeContracts';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';

type Events = ElectronAPI['on'];

/** The payload an event subscription delivers to its listener. */
type EventPayload<E extends keyof Events> = Parameters<Parameters<Events[E]>[0]>[0];

/** The preload API with a mock for every bridge method and event subscription. */
export type MockedElectronAPI = {
  -readonly [N in keyof ElectronAPI]: ElectronAPI[N] extends object
    ? { [M in keyof ElectronAPI[N]]: Mock }
    : ElectronAPI[N];
};

/** Listeners currently subscribed through each mock API's `on`, by event name. */
const subscribedListeners = new WeakMap<object, Map<string, Set<(payload: unknown) => void>>>();

function mockMethods(names: readonly string[]): Record<string, Mock> {
  return Object.fromEntries(names.map((name) => [name, vi.fn()]));
}

/** Event subscriptions that keep their listener until the returned unsubscribe function is called. */
function mockEvents(): Record<string, Mock> {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = Object.fromEntries(
    Object.keys(eventsContract.events).map((name) => {
      const subscribed = new Set<(payload: unknown) => void>();
      listeners.set(name, subscribed);
      return [
        name,
        vi.fn((listener: (payload: unknown) => void) => {
          subscribed.add(listener);
          return () => subscribed.delete(listener);
        }),
      ];
    }),
  );
  subscribedListeners.set(on, listeners);
  return on;
}

const IDLE_UPDATE_STATE = {
  status: 'idle',
  currentVersion: '0.1.0',
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
};

/**
 * A mock of the preload API with one `vi.fn()` per contract procedure and event. Queries the renderer reads on
 * mount resolve with neutral data; every other method resolves to `undefined` until a test sets it.
 */
export function createMockElectronAPI(): MockedElectronAPI {
  const bridge = Object.fromEntries(
    Object.entries(laneBridgeContracts).map(([namespace, contract]) => [
      namespace,
      mockMethods(Object.keys(contract.procedures)),
    ]),
  );
  const session = mockMethods(Object.keys(sessionContract.procedures));
  const api = {
    ...bridge,
    hasNativeWindowFrame: false,
    appVersion: '0.1.0',
    commands: { recordShot: session.recordShot, switchMode: session.switchMode },
    queries: { getSessionScore: session.getSessionScore, getShotHistory: session.getShotHistory },
    on: mockEvents(),
  } as MockedElectronAPI;

  api.usb.listPorts.mockResolvedValue({
    success: true,
    data: {
      ports: [
        { path: 'COM3', manufacturer: 'FTDI' },
        { path: 'COM4', manufacturer: 'Prolific' },
        { path: '/dev/ttyUSB0', manufacturer: 'FTDI' },
        { path: '/dev/ttyUSB1', manufacturer: undefined },
      ],
    },
  });
  api.settings.savePrintSettings.mockResolvedValue({ success: true });
  api.settings.getConnectionSettings.mockResolvedValue({ success: true, data: {} });
  api.settings.getUserPreferences.mockResolvedValue({ success: true, data: {} });
  api.settings.getAppSettings.mockResolvedValue({
    success: true,
    data: {
      connection: { portName: '', manufacturer: 'KOHTO', deviceId: '' },
      userPreferences: { laneNumber: 1, discipline: null, competitionTypeId: '', audioVolume: 50 },
      mqtt: {
        enabled: false,
        brokerUrl: '',
        laneAlias: '',
        autoConnect: false,
        laneId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  });
  api.settings.getSettingsFileInfo.mockResolvedValue({ success: true, data: { path: '/tmp/settings.json' } });
  api.report.listPrinters.mockResolvedValue({ success: true, data: [] });
  api.report.printReady.mockResolvedValue({ success: true });
  api.mqtt.getDirectorMembership.mockResolvedValue({ success: true, data: { competitionId: null, revision: 0 } });
  api.timedTarget.getTimingSettings.mockResolvedValue({
    success: true,
    data: { mode: 'BOUNDED', maximumReceiptDelayMilliseconds: null, clockUncertaintyMilliseconds: null },
  });
  api.timedTarget.getState.mockResolvedValue({ success: true, data: null });
  api.window.minimize.mockResolvedValue({ success: true });
  api.window.maximize.mockResolvedValue({ success: true, data: { isMaximized: false, isFullscreen: false } });
  api.window.close.mockResolvedValue({ success: true });
  api.window.getWindowState.mockResolvedValue({ success: true, data: { isMaximized: false, isFullscreen: false } });
  api.updates.getUpdateState.mockResolvedValue({ success: true, data: IDLE_UPDATE_STATE });
  api.updates.checkForUpdates.mockResolvedValue({
    success: true,
    data: { ...IDLE_UPDATE_STATE, status: 'checking', canCheckForUpdates: false },
  });
  api.updates.quitAndInstall.mockResolvedValue({ success: true });
  return api;
}

/** Replaces `window.electronAPI` with a new mock and returns it. */
export function installMockElectronAPI(): MockedElectronAPI {
  const api = createMockElectronAPI();
  window.electronAPI = api as unknown as ElectronAPI;
  return api;
}

/** Delivers `payload` to the listeners subscribed to `event` on the installed mock API. */
export function emit<E extends keyof Events>(event: E, payload: EventPayload<E>): void {
  const listeners = subscribedListeners.get(window.electronAPI.on)?.get(event);
  if (!listeners) throw new Error('window.electronAPI is not a mock from createMockElectronAPI');
  for (const listener of [...listeners]) listener(payload);
}
