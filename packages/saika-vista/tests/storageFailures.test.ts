// SPDX-License-Identifier: MIT
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createVistaServer, requestVista } from '@sasakiuri/saika-protocol/vista-node';
import { afterEach, expect, it, vi } from 'vitest';

import { AtomicStore, AtomicStoreSyncError } from '../src/main/AtomicStore';
import { DisplayState } from '../src/main/DisplayState';
import { DocumentSchema, newDocument } from '../src/main/document';
import { VistaApplication, type DesktopPort } from '../src/main/VistaApplication';
import type { NodeState, ScreenConfig } from '../src/shared/model';

import { screenConfig, snapshot } from './fixtures';

const fault = vi.hoisted(() => ({ directory: '', phase: '', persistent: false, skip: 0 }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  const fail = (phase: string) => {
    if (fault.phase !== phase) return;
    if (fault.skip > 0) {
      fault.skip--;
      return;
    }
    if (!fault.persistent) fault.phase = '';
    throw new Error(`Injected ${phase} failure`);
  };
  return {
    ...original,
    rename: async (...args: Parameters<typeof original.rename>) => {
      fail('rename');
      return original.rename(...args);
    },
    open: async (...args: Parameters<typeof original.open>) => {
      const directory = args[0] === fault.directory && args[1] === 'r';
      if (directory) fail('directory-open');
      const handle = await original.open(...args);
      if (directory || (typeof args[0] === 'string' && args[0].startsWith(fault.directory) && args[1] === 'wx')) {
        const sync = handle.sync.bind(handle);
        const close = handle.close.bind(handle);
        handle.sync = async () => {
          fail(directory ? 'directory-sync' : 'file-sync');
          return sync();
        };
        handle.close = async () => {
          await close();
          fail(directory ? 'directory-close' : 'file-close');
        };
      }
      return handle;
    },
  };
});

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  fault.phase = '';
  fault.persistent = false;
  fault.skip = 0;
  for (const clean of cleanup.reverse()) await clean();
  cleanup.length = 0;
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'vista-storage-'));
  cleanup.push(() => rm(path, { recursive: true, force: true }));
  fault.directory = path;
  return path;
}

const failureCases = ['file-sync', 'file-close', 'rename', 'directory-open', 'directory-sync', 'directory-close'];
it
  .skipIf(process.platform === 'win32')
  .each(failureCases.flatMap((phase) => [false, true].map((previous) => ({ phase, previous }))))(
  'keeps OS, memory and JSON consistent after $phase (previous=$previous)',
  async ({ phase, previous }) => {
    const path = await directory();
    let osEnabled = false;
    const desktop: DesktopPort = {
      monitors: () => [],
      open: vi.fn(),
      close: vi.fn(),
      status: () => ({ revision: null, alive: false }),
      changed: vi.fn(),
      loginStart: vi.fn(async (enabled) => {
        osEnabled = enabled;
      }),
    };
    const app = await VistaApplication.start(path, desktop);
    cleanup.push(async () => {
      await app.command({ type: 'setLoginStart', enabled: previous });
      await app.stop();
    });
    const internals = app as unknown as {
      timer: ReturnType<typeof setTimeout> | null;
      activeTasks: Set<Promise<void>>;
    };
    if (internals.timer) clearTimeout(internals.timer);
    await Promise.allSettled([...internals.activeTasks]);
    await app.command({ type: 'setLoginStart', enabled: previous });
    vi.mocked(desktop.loginStart).mockClear();
    fault.phase = phase;

    const replaced = phase.startsWith('directory');
    const expected = replaced ? !previous : previous;
    await expect(app.command({ type: 'setLoginStart', enabled: !previous })).rejects.toThrow(
      replaced ? 'durable storage was not confirmed' : 'The previous setting was restored.',
    );
    expect(osEnabled).toBe(expected);
    expect(app.view().loginStart).toBe(expected);
    expect(JSON.parse(await readFile(join(path, 'vista.json'), 'utf8')).loginStart).toBe(expected);
    expect(desktop.loginStart).toHaveBeenCalledTimes(replaced ? 1 : 2);
    const injectedError = expect.stringContaining(`Injected ${phase} failure`);
    expect(app.view().error).toEqual(replaced ? injectedError : null);

    await app.command({ type: 'setLoginStart', enabled: !previous });
    expect(osEnabled).toBe(!previous);
    expect(app.view().loginStart).toBe(!previous);
    expect(app.view().error).toBeNull();
    expect(JSON.parse(await readFile(join(path, 'vista.json'), 'utf8')).loginStart).toBe(!previous);
  },
);

it.skipIf(process.platform === 'win32')(
  'retains a replaced frame and its ordering while reporting unconfirmed storage until a successful write',
  async () => {
    const path = await directory();
    const store = new AtomicStore(join(path, 'vista.json'), DocumentSchema);
    const state = new DisplayState(await store.read(newDocument), store, vi.fn());
    const owner = { controllerId: 'operator', controllerGeneration: 1 };
    await state.register(owner);
    await state.apply(
      screenConfig(),
      [{ id: 'monitor-one', name: 'Monitor', width: 1920, height: 1080, primary: true }],
      owner,
    );
    const data = snapshot();
    const frame = {
      ...owner,
      sequence: 1,
      configs: [{ id: 'screen-one', revision: 1 }],
      entries: [{ snapshot: data, state: 'live', receivedAt: Date.now(), error: null }],
    };
    fault.phase = 'directory-sync';
    await expect(state.receiveFrame(frame)).resolves.toMatchObject({
      durable: false,
      error: expect.any(AtomicStoreSyncError),
    });
    expect(state.audience('screen-one').entries[0]!.snapshot).toEqual(data);
    expect((await store.read(newDocument)).snapshots).toEqual(state.document.snapshots);
    expect(state.persistenceError).toContain('durable storage was not confirmed');
    await expect(state.receiveFrame(frame)).rejects.toThrow('older display frame');
    expect(state.persistenceError).toContain('durable storage was not confirmed');
    await state.receiveFrame({ ...frame, sequence: 2 });
    expect(state.persistenceError).toBeNull();
  },
);

async function display() {
  const path = await directory();
  const outputs = new Map<string, ScreenConfig>();
  const desktop: DesktopPort = {
    monitors: () => [{ id: 'monitor-one', name: 'Monitor', width: 1920, height: 1080, primary: true }],
    open: (config) => {
      outputs.set(config.id, config);
    },
    close: (id) => {
      outputs.delete(id);
    },
    status: (id) => ({ revision: outputs.get(id)?.revision ?? null, alive: outputs.has(id) }),
    changed: vi.fn(),
    loginStart: vi.fn(async () => undefined),
  };
  const app = await VistaApplication.start(path, desktop);
  cleanup.push(() => app.stop());
  const internals = app as unknown as { timer: ReturnType<typeof setTimeout> | null; activeTasks: Set<Promise<void>> };
  if (internals.timer) clearTimeout(internals.timer);
  await Promise.allSettled([...internals.activeTasks]);
  const endpoint = () => `http://127.0.0.1:${app.state.document.port}`;
  const request = (method: 'GET' | 'POST', operation: string, body?: unknown, secret = app.view().pairingSecret) =>
    requestVista<NodeState>(endpoint(), secret, method, `/vista/v1/display/${operation}`, body, app.identity.sourceId);
  const disk = async () => DocumentSchema.parse(JSON.parse(await readFile(join(path, 'vista.json'), 'utf8')));
  return { app, path, outputs, endpoint, request, disk };
}
const standby = () => ({ ...screenConfig(), selections: [], standby: true });

it.skipIf(process.platform === 'win32').each(['apply', 'remove'] as const)(
  'completes local screen %s after file replacement even when storage confirmation fails',
  async (operation) => {
    const { app, outputs, disk } = await display();
    if (operation === 'remove') await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: standby() });
    fault.phase = 'directory-sync';
    const command =
      operation === 'apply'
        ? { type: 'apply' as const, nodeId: app.identity.sourceId, config: standby() }
        : { type: 'removeScreen' as const, nodeId: app.identity.sourceId, screenId: 'screen-one' };
    await expect(app.command(command)).rejects.toThrow('The change took effect');
    expect(outputs.has('screen-one')).toBe(operation === 'apply');
    expect((await disk()).screens).toEqual(app.state.document.screens);
    expect(app.node().persistenceError).toContain('durable storage was not confirmed');
    expect(app.node().screens).toMatchObject(
      operation === 'apply' ? [{ appliedRevision: null, renderAlive: true }] : [],
    );
    await app.command(command);
    expect(app.node().persistenceError).toBeNull();
  },
);

it.skipIf(process.platform === 'win32').each(['apply', 'remove'] as const)(
  'returns the actual remote screen after %s with an explicit storage warning and completed window effects',
  async (operation) => {
    const { app, outputs, request, disk } = await display();
    const owner = { controllerId: 'operator', controllerGeneration: 1 };
    await request('POST', 'register', owner);
    if (operation === 'remove') await request('POST', 'apply', { ...owner, config: standby() });
    fault.phase = 'directory-sync';
    const body = operation === 'apply' ? { ...owner, config: standby() } : { ...owner, screenId: 'screen-one' };
    const changed = await request('POST', operation, body);
    expect(changed.persistenceError).toContain('durable storage was not confirmed');
    expect(outputs.has('screen-one')).toBe(operation === 'apply');
    expect((await disk()).screens).toEqual(app.state.document.screens);
    expect(changed.screens).toMatchObject(operation === 'apply' ? [{ appliedRevision: null }] : []);
    const retried = await request('POST', operation, body);
    expect(retried.persistenceError).toBeNull();
    expect(retried.screens).toMatchObject(operation === 'apply' ? [{ appliedRevision: 1 }] : []);
  },
);

it.skipIf(process.platform === 'win32')(
  'restarts local control with the new authority after an unconfirmed revoke write',
  async () => {
    const { app, request } = await display();
    const oldSecret = app.view().pairingSecret;
    await request('POST', 'register', { controllerId: 'operator', controllerGeneration: 1 });
    fault.phase = 'directory-sync';
    await expect(app.command({ type: 'revokeController' })).rejects.toThrow('The change took effect');
    expect(app.view().pairingSecret).not.toBe(oldSecret);
    expect(app.view().local.controllerId).toBeNull();
    expect((await request('GET', 'state')).persistenceError).toContain('durable storage was not confirmed');
    await expect(request('GET', 'state', undefined, oldSecret)).rejects.toThrow();
  },
);

it.skipIf(process.platform === 'win32').each([0, 1])(
  'finishes remote release and reopens the listener when release write %i cannot be confirmed',
  async (skip) => {
    const { app, request } = await display();
    const owner = { controllerId: 'operator', controllerGeneration: 1 };
    await request('POST', 'register', owner);
    const oldSecret = app.view().pairingSecret;
    fault.phase = 'directory-sync';
    fault.skip = skip;
    const released = await request('POST', 'release', owner);
    await vi.waitFor(() => {
      expect(app.state.document.releasing).toBe(false);
      expect(app.view().pairingSecret).not.toBe(oldSecret);
      expect(app.view().endpoints.length).toBeGreaterThan(0);
    });
    const restored = await request('GET', 'state');
    expect(restored.controllerId).toBeNull();
    expect((skip === 0 ? released : restored).persistenceError).toContain('durable storage was not confirmed');
    await expect(request('GET', 'state', undefined, oldSecret)).rejects.toThrow();
  },
);

it.skipIf(process.platform === 'win32')(
  'finishes both sides of pairing and removal when the remote writes are unconfirmed',
  async () => {
    const controller = await display();
    const remote = await display();
    fault.phase = 'directory-sync';
    await expect(
      controller.app.command({
        type: 'connectPeer',
        endpoint: remote.endpoint(),
        secret: remote.app.view().pairingSecret,
      }),
    ).rejects.toThrow('durable storage was not confirmed');
    expect(controller.app.state.document.peers[0]!.id).toBe(remote.app.identity.sourceId);
    expect(controller.app.view().peers[0]!.node?.persistenceError).toContain('durable storage was not confirmed');
    expect(remote.app.node().controllerId).toBe(controller.app.identity.sourceId);
    fault.phase = 'directory-sync';
    await expect(controller.app.command({ type: 'removePeer', id: remote.app.identity.sourceId })).rejects.toThrow(
      'durable storage was not confirmed',
    );
    expect(controller.app.state.document.peers).toEqual([]);
    expect(controller.app.view().peers).toEqual([]);
    await vi.waitFor(() => expect(remote.app.state.document.releasing).toBe(false));
    expect(remote.app.state.document.controller).toBeNull();
  },
);

it.skipIf(process.platform === 'win32')(
  'forwards an unconfirmed desired screen and finishes remote removal on both PCs',
  async () => {
    const controller = await display();
    const remote = await display();
    await controller.app.command({
      type: 'connectPeer',
      endpoint: remote.endpoint(),
      secret: remote.app.view().pairingSecret,
    });
    fault.directory = controller.path;
    fault.phase = 'directory-sync';
    await expect(
      controller.app.command({
        type: 'apply',
        nodeId: remote.app.identity.sourceId,
        config: standby(),
      }),
    ).rejects.toThrow('durable storage was not confirmed');
    expect(remote.outputs.get('screen-one')).toEqual(standby());
    expect(controller.app.state.document.peers[0]!.desired).toEqual([standby()]);
    fault.directory = remote.path;
    fault.phase = 'directory-sync';
    await expect(
      controller.app.command({
        type: 'removeScreen',
        nodeId: remote.app.identity.sourceId,
        screenId: 'screen-one',
      }),
    ).rejects.toThrow('durable storage was not confirmed');
    expect(remote.outputs.size).toBe(0);
    expect(remote.app.state.document.screens).toEqual([]);
    expect(controller.app.state.document.peers[0]!.desired).toEqual([]);
    expect((await controller.disk()).peers[0]!.desired).toEqual([]);
  },
);

it.skipIf(process.platform === 'win32')(
  'finishes source connection and cache removal despite unconfirmed storage',
  async () => {
    const { app } = await display();
    const identity = {
      protocolVersion: 1 as const,
      sourceId: 'lane-one',
      bootId: 'boot-one',
      kind: 'lane' as const,
      name: 'Lane 1',
    };
    const secret = 's'.repeat(43);
    const server = await createVistaServer({
      identity,
      secret,
      handle: (_method, path) => {
        if (path.endsWith('/catalog'))
          return {
            identity,
            subjects: [
              {
                id: 'session-one',
                label: 'Session',
                eventCode: 'AR60',
                competition: null,
                relay: null,
                availability: 'available',
                reason: null,
              },
            ],
          };
        return snapshot();
      },
    });
    cleanup.push(() => server.close());
    fault.phase = 'directory-sync';
    await expect(
      app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret }),
    ).rejects.toThrow('durable storage was not confirmed');
    expect(app.view().sources[0]!.state).toBe('connected');
    await app.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
    fault.phase = 'directory-sync';
    fault.persistent = true;
    await expect(app.command({ type: 'removeSource', id: 'lane-one' })).rejects.toThrow(
      'durable storage was not confirmed',
    );
    expect(app.view().sources).toEqual([]);
    expect(app.state.getEntries()[0]!.state).toBe('saved');
    expect(app.state.getEntries()[0]!.error).toBe('The source was disconnected by the operator');
    const caches = app as unknown as { sourceViews: Map<string, unknown>; lastCatalog: Map<string, number> };
    expect(caches.sourceViews.has('lane-one')).toBe(false);
    expect(caches.lastCatalog.has('lane-one')).toBe(false);
  },
);
