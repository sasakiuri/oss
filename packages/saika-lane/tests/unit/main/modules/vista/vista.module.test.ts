// SPDX-License-Identifier: MIT
import { join } from 'node:path';

import type { InferHandlers } from '@sasakiuri/saika-ipc';
import { describe, expect, it, vi } from 'vitest';

import { Mode } from '@/main/modules/session/domain/Mode';
import { vistaModule } from '@/main/modules/vista/vista.module';
import type { vistaContract } from '@/shared/ipc/contracts/vista.contract';

import { createMockEventBus } from '../../../../helpers/mockDependencies';

const { refresh, handle, sourceOptions, loadCredentials, rotateCredentials, createHost } = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue(undefined),
  handle: vi.fn(),
  sourceOptions: [] as Array<{ identity: { name: string } }>,
  loadCredentials: vi.fn(() => ({ sourceId: 'lane-1', secret: 'test-secret' })),
  rotateCredentials: vi.fn(),
  createHost: vi.fn(),
}));
vi.mock('@sasakiuri/saika-protocol/vista-node', () => ({
  loadVistaCredentials: loadCredentials,
  rotateVistaCredentials: rotateCredentials,
  createVistaHost: createHost,
}));
vi.mock('@/main/modules/vista/infra/LaneVistaShotContextReader', () => ({ LaneVistaShotContextReader: class {} }));
vi.mock('@/main/modules/vista/infra/LaneVistaSource', () => ({
  LaneVistaSource: class {
    constructor(options: { identity: { name: string } }) {
      sourceOptions.push(options);
    }

    refresh = refresh;
    handle = handle;
    getError = () => null;
  },
}));

type VistaHandlers = InferHandlers<typeof vistaContract>;
type HostOptions = { secret: () => string; port: number; handle: (method: string, path: string) => unknown };

const CREDENTIALS_PATH = join('/unused', 'vista', 'credentials.json');

function fakeHost(endpoints: string[] = ['https://192.0.2.10:45831']) {
  return { endpoints, close: vi.fn().mockResolvedValue(undefined) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Registers the module and returns its IPC handlers, the storage it writes and the window close hook. */
function registerVista(values: Record<string, unknown> = {}) {
  const register = vi.fn();
  const once = vi.fn();
  const eventBus = createMockEventBus();
  const storage = { get: vi.fn((key: string) => values[key]), set: vi.fn() };
  vistaModule.register({
    userDataPath: '/unused',
    storage,
    eventBus,
    mainWindow: { once },
    ipcRouter: { register },
  } as unknown as Parameters<typeof vistaModule.register>[0]);
  return {
    handlers: register.mock.calls[0]![1] as VistaHandlers,
    storage,
    eventBus,
    closeWindow: () => (once.mock.calls[0]![1] as () => void)(),
  };
}

describe('vista module target mode refresh', () => {
  it('refreshes the competition on a selection even without a clock tick and unsubscribes on close', () => {
    const events = createMockEventBus();
    const closed = vi.fn();
    vistaModule.register({
      userDataPath: '/unused',
      storage: { get: vi.fn() },
      eventBus: events,
      mainWindow: { once: closed },
      ipcRouter: { register: vi.fn() },
    } as unknown as Parameters<typeof vistaModule.register>[0]);
    refresh.mockClear();
    const event = {
      type: 'AthleteTargetModeChanged' as const,
      aggregateId: 'comp-1',
      timestamp: Date.now(),
      newMode: Mode.sighting(),
    };
    events.emit(event);
    expect(refresh).toHaveBeenCalledExactlyOnceWith('comp-1');
    closed.mock.calls[0]![1]();
    refresh.mockClear();
    events.emit(event);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('vista module source identity', () => {
  function registeredName(values: Record<string, unknown>): string {
    sourceOptions.length = 0;
    vistaModule.register({
      userDataPath: '/unused',
      storage: { get: (key: string) => values[key] },
      eventBus: createMockEventBus(),
      mainWindow: { once: vi.fn() },
      ipcRouter: { register: vi.fn() },
    } as unknown as Parameters<typeof vistaModule.register>[0]);
    return sourceOptions[0]!.identity.name;
  }

  it('names the source after the Lane Alias saved with the MQTT settings', () => {
    expect(registeredName({ 'mqtt.settings': { laneAlias: 'Lane Seven' }, userPreferences: { laneNumber: 7 } })).toBe(
      'Lane Seven',
    );
  });

  it('keeps the numbered name when the alias is too long for Vista', () => {
    expect(
      registeredName({ 'mqtt.settings': { laneAlias: 'x'.repeat(4096) }, userPreferences: { laneNumber: 7 } }),
    ).toBe('Saika Lane 7');
  });

  it('falls back to the Lane number when no alias is saved', () => {
    expect(registeredName({ 'mqtt.settings': { laneAlias: '' }, userPreferences: { laneNumber: 7 } })).toBe(
      'Saika Lane 7',
    );
  });
});

describe('vista module sharing host', () => {
  it('starts the host on enable, serves the source with the saved secret and closes it on disable', async () => {
    const host = fakeHost();
    createHost.mockResolvedValueOnce(host);
    const { handlers, storage } = registerVista();

    await expect(handlers.setEnabled({ enabled: true })).resolves.toEqual({
      enabled: true,
      sourceId: 'lane-1',
      secret: 'test-secret',
      endpoints: ['https://192.0.2.10:45831'],
      error: null,
    });
    expect(createHost).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ identity: expect.objectContaining({ sourceId: 'lane-1', kind: 'lane' }), port: 45831 }),
    );
    const options = createHost.mock.calls[0]![0] as HostOptions;
    expect(options.secret()).toBe('test-secret');
    handle.mockReturnValueOnce('snapshot');
    expect(options.handle('GET', '/v1/snapshot')).toBe('snapshot');
    expect(handle).toHaveBeenCalledExactlyOnceWith('GET', '/v1/snapshot');
    expect(storage.set).toHaveBeenLastCalledWith('vista.enabled', true);

    await expect(handlers.setEnabled({ enabled: false })).resolves.toMatchObject({ enabled: false, endpoints: [] });
    expect(host.close).toHaveBeenCalledOnce();
    expect(storage.set).toHaveBeenLastCalledWith('vista.enabled', false);
  });

  it('rotates the pairing secret and restarts a running host with it', async () => {
    const first = fakeHost();
    const second = fakeHost(['https://198.51.100.4:45831']);
    createHost.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    rotateCredentials.mockReturnValueOnce({ sourceId: 'lane-1', secret: 'rotated-secret' });
    const { handlers } = registerVista();
    await handlers.setEnabled({ enabled: true });

    await expect(handlers.resetPairing({})).resolves.toEqual({
      enabled: true,
      sourceId: 'lane-1',
      secret: 'rotated-secret',
      endpoints: ['https://198.51.100.4:45831'],
      error: null,
    });
    expect(first.close).toHaveBeenCalledOnce();
    expect(rotateCredentials).toHaveBeenCalledExactlyOnceWith(CREDENTIALS_PATH);
    expect(createHost).toHaveBeenCalledTimes(2);
    expect((createHost.mock.calls[1]![0] as HostOptions).secret()).toBe('rotated-secret');
  });

  it('rotates the pairing secret without starting a host while sharing is off', async () => {
    rotateCredentials.mockReturnValueOnce({ sourceId: 'lane-1', secret: 'rotated-secret' });
    const { handlers, storage } = registerVista();

    await expect(handlers.resetPairing({})).resolves.toMatchObject({ enabled: false, secret: 'rotated-secret' });
    expect(createHost).not.toHaveBeenCalled();
    expect(storage.set).toHaveBeenCalledExactlyOnceWith('vista.enabled', false);
  });

  it('reports a host start failure in the status and keeps sharing off', async () => {
    createHost.mockRejectedValueOnce(new Error('Port 45831 is in use'));
    const { handlers, storage } = registerVista();

    await expect(handlers.setEnabled({ enabled: true })).rejects.toThrow('Port 45831 is in use');
    await expect(handlers.getStatus()).resolves.toMatchObject({ enabled: false, error: 'Port 45831 is in use' });
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('restores saved sharing at start and closes the host with the window', async () => {
    const host = fakeHost();
    createHost.mockResolvedValueOnce(host);
    const { handlers, closeWindow } = registerVista({ 'vista.enabled': true });

    await vi.waitFor(async () => expect(await handlers.getStatus()).toMatchObject({ enabled: true }));
    closeWindow();
    expect(host.close).toHaveBeenCalledOnce();
  });

  it('closes a host that finishes starting after the window closed and ignores later changes', async () => {
    const host = fakeHost();
    const starting = deferred<typeof host>();
    createHost.mockReturnValueOnce(starting.promise);
    const { handlers, storage, closeWindow } = registerVista();

    const enabling = handlers.setEnabled({ enabled: true });
    await vi.waitFor(() => expect(createHost).toHaveBeenCalledOnce());
    closeWindow();
    starting.resolve(host);

    await expect(enabling).resolves.toMatchObject({ enabled: false, endpoints: [] });
    expect(host.close).toHaveBeenCalledOnce();
    await expect(handlers.setEnabled({ enabled: true })).resolves.toMatchObject({ enabled: false });
    expect(createHost).toHaveBeenCalledOnce();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('registers an unavailable source when the credentials cannot be loaded', async () => {
    loadCredentials.mockImplementationOnce(() => {
      throw new Error('credentials.json is corrupt');
    });
    sourceOptions.length = 0;
    const { handlers, storage, eventBus } = registerVista();
    const unavailable = {
      enabled: false,
      sourceId: '',
      secret: '',
      endpoints: [],
      error: 'credentials.json is corrupt',
    };

    expect(sourceOptions).toHaveLength(0);
    expect(eventBus.on).not.toHaveBeenCalled();
    await expect(handlers.getStatus()).resolves.toEqual(unavailable);
    await expect(handlers.resetPairing({})).rejects.toThrow('credentials.json is corrupt');
    await expect(handlers.setEnabled({ enabled: true })).rejects.toThrow('credentials.json is corrupt');
    expect(storage.set).not.toHaveBeenCalled();
    await expect(handlers.setEnabled({ enabled: false })).resolves.toEqual(unavailable);
    expect(storage.set).toHaveBeenCalledExactlyOnceWith('vista.enabled', false);
    expect(createHost).not.toHaveBeenCalled();
  });
});
