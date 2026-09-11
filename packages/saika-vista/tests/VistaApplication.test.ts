// SPDX-License-Identifier: MIT
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createVistaServer, requestVista, type VistaServer } from '@sasakiuri/saika-protocol/vista-node';
import { afterEach, expect, it, vi } from 'vitest';

import { AtomicStore } from '../src/main/AtomicStore';
import { DocumentSchema, newDocument } from '../src/main/document';
import { VistaApplication, type DesktopPort } from '../src/main/VistaApplication';
import { publicationLabel } from '../src/renderer/viewModel';

import { screenConfig, snapshot } from './fixtures';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const clean of cleanup.reverse()) await clean();
  cleanup.length = 0;
});
const secret = 'a'.repeat(43);
const desktop = (): DesktopPort => ({
  monitors: () => [{ id: 'monitor-one', name: 'Monitor', width: 1920, height: 1080, primary: true }],
  open: vi.fn(),
  close: vi.fn(),
  status: () => ({ revision: null, alive: false }),
  loginStart: async () => undefined,
  changed: vi.fn(),
});
async function start(port = desktop()) {
  const directory = await mkdtemp(join(tmpdir(), 'vista-app-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const app = await VistaApplication.start(directory, port);
  cleanup.push(() => app.stop());
  return app;
}
async function pausePolling(app: VistaApplication) {
  const scheduled = app as unknown as {
    timer: ReturnType<typeof setTimeout> | null;
    activeTasks: Set<Promise<void>>;
    syncPeer(id: string): Promise<void>;
  };
  if (scheduled.timer) clearTimeout(scheduled.timer);
  await Promise.allSettled([...scheduled.activeTasks]);
  return scheduled;
}
async function source(
  current: (subjectId: string) => Promise<ReturnType<typeof snapshot>> = async () => snapshot(),
  kind: 'lane' | 'director' = 'lane',
  subjects = ['session-one'],
): Promise<VistaServer> {
  const identity = {
    protocolVersion: 1 as const,
    sourceId: 'lane-one',
    bootId: 'boot-one',
    kind,
    name: 'Lane 1',
  };
  const server = await createVistaServer({
    identity,
    secret,
    handle: (method, path) => {
      if (method !== 'GET') throw new Error('Read only');
      if (path.endsWith('/catalog'))
        return {
          identity,
          subjects: subjects.map((id) => ({
            id,
            label: 'Session 1',
            eventCode: 'AR60',
            competition: null,
            relay: null,
            availability: 'available',
            reason: null,
          })),
        };
      const subjectId = subjects.find((id) => path.endsWith(`/snapshot/${id}`));
      if (subjectId) return current(subjectId);
      throw new Error('Not found');
    },
  });
  cleanup.push(() => server.close());
  return server;
}

it('connects without a broker, restores complete history and separates persisted settings from rendering', async () => {
  const server = await source();
  const app = await start();
  await app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: screenConfig() });
  await vi.waitFor(() => expect(app.view().snapshots[0]?.state).toBe('live'));
  expect(app.view().local.screens[0]?.appliedRevision).toBe(1);
  expect(app.view().local.screens[0]?.renderedRevision).toBeNull();
  expect(app.state.audience('screen-one').entries[0]?.snapshot.participants[0]?.shots).toHaveLength(1);
  await expect(
    app.command({ type: 'apply', nodeId: app.identity.sourceId, config: { ...screenConfig(2), view: 'ranking' } }),
  ).rejects.toThrow('Director');
});

it('restores screens and continues source updates when its saved port is occupied, then recovers on that port', async () => {
  let revision = 1;
  const server = await source(async () => ({ ...snapshot(revision), finished: true }));
  const directory = await mkdtemp(join(tmpdir(), 'vista-listener-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const occupied = createServer();
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!occupied.listening) resolve();
        else occupied.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  let application: VistaApplication | null = null;
  cleanup.push(async () => application?.stop());
  application = await VistaApplication.start(directory, desktop());
  await application.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await application.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
  await application.command({ type: 'apply', nodeId: application.identity.sourceId, config: screenConfig() });
  const savedPort = application.state.document.port;
  const savedSecret = application.view().pairingSecret;
  await application.stop();
  application = null;
  await new Promise<void>((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(savedPort, '0.0.0.0', resolve);
  });

  const restoredDesktop = desktop();
  application = await VistaApplication.start(directory, restoredDesktop);
  expect(restoredDesktop.open).toHaveBeenCalledWith(screenConfig());
  expect(application.state.audience('screen-one').entries[0]).toMatchObject({
    state: 'saved',
    snapshot: { revision: 1, finished: true },
  });
  expect(application.view()).toMatchObject({
    endpoints: [],
    pairingSecret: savedSecret,
    error: expect.stringContaining(`TCP port ${savedPort}`),
  });
  expect(application.view().error).toContain('EADDRINUSE');
  expect(application.state.document.port).toBe(savedPort);
  revision = 2;
  await vi.waitFor(() => expect(application!.view().snapshots[0]?.snapshot.revision).toBe(2));
  expect(application.view().sources[0]?.state).toBe('connected');
  expect(JSON.parse(await readFile(join(directory, 'vista.json'), 'utf8')).port).toBe(savedPort);

  await application.stop();
  application = null;
  await new Promise<void>((resolve, reject) => occupied.close((error) => (error ? reject(error) : resolve())));
  const recoveredDesktop = desktop();
  application = await VistaApplication.start(directory, recoveredDesktop);
  expect(recoveredDesktop.open).toHaveBeenCalledWith(screenConfig());
  expect(application.view().error).toBeNull();
  expect(application.state.document.port).toBe(savedPort);
  const endpoint = `http://127.0.0.1:${savedPort}`;
  expect(application.view().endpoints).toContain(endpoint);
  await expect(
    requestVista(endpoint, savedSecret, 'GET', '/vista/v1/display/state', undefined, application.identity.sourceId),
  ).resolves.toMatchObject({ identity: application.identity });
});

it('keeps saved remote screens visible when the first connection after restart fails', async () => {
  const unavailable = createServer();
  await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
  const address = unavailable.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP port');
  const endpoint = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve, reject) => unavailable.close((error) => (error ? reject(error) : resolve())));
  const directory = await mkdtemp(join(tmpdir(), 'vista-offline-peer-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const config = screenConfig();
  await new AtomicStore(join(directory, 'vista.json'), DocumentSchema).write({
    ...newDocument(),
    peers: [{ id: 'saved-display', endpoint, secret, desired: [config] }],
  });
  const app = await VistaApplication.start(directory, desktop());
  cleanup.push(() => app.stop());
  const scheduled = await pausePolling(app);
  expect(app.view().peers[0]!.node?.screens[0]!.config).toEqual(config);

  await scheduled.syncPeer('saved-display');

  const peer = app.view().peers[0]!;
  expect(peer.error).toBeTruthy();
  expect(peer.node?.screens).toEqual([
    {
      config,
      appliedRevision: null,
      renderedRevision: null,
      renderAlive: false,
      monitorAvailable: false,
      error: peer.error,
    },
  ]);
  expect(app.state.document.peers[0]!.desired).toEqual([config]);
});

it('keeps invalid pairing authority fatal instead of treating it as an unavailable listener', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-authority-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  await new AtomicStore(join(directory, 'vista.json'), DocumentSchema).write({
    ...newDocument(),
    secret: 'a'.repeat(257),
    screens: [screenConfig()],
  });
  const port = desktop();
  await expect(VistaApplication.start(directory, port)).rejects.toThrow('Invalid Vista pairing secret');
  expect(port.open).not.toHaveBeenCalled();
});

it('keeps failure to persist an allocated listener port fatal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-port-storage-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const store = new AtomicStore(join(directory, 'vista.json'), DocumentSchema);
  await store.write({ ...newDocument(), screens: [screenConfig()] });
  const write = AtomicStore.prototype.write;
  vi.spyOn(AtomicStore.prototype, 'write').mockImplementation(function (this: AtomicStore<unknown>, value) {
    if (DocumentSchema.parse(value).port > 0) return Promise.reject(new Error('Disk full'));
    return write.call(this, value);
  });
  const port = desktop();
  await expect(VistaApplication.start(directory, port)).rejects.toThrow('Disk full');
  expect(port.open).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(join(directory, 'vista.json'), 'utf8')).port).toBe(0);
});

it.each(['stale', 'incomplete'] as const)(
  'isolates a Director participant with %s data from healthy lanes',
  async (fault) => {
    const current = snapshot();
    const healthy = current.participants[0]!;
    current.participants.push({
      ...healthy,
      id: 'athlete-two',
      laneId: 'lane-two',
      dataState: fault === 'stale' ? 'stale' : 'live',
      historyComplete: fault !== 'incomplete',
    });
    const server = await source(async () => current, 'director');
    const app = await start();
    await app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
    await app.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
    expect(app.view().snapshots[0]?.state).toBe('live');
    expect(app.view().snapshots[0]?.snapshot.participants).toEqual(current.participants);
  },
);

it('centrally applies remote screens, transfers saved data, and rejects old secrets after revocation', async () => {
  const server = await source();
  const controller = await start();
  const display = await start();
  const endpoint = display.view().endpoints.find((value) => value.includes('127.0.0.1'))!;
  const oldSecret = display.view().pairingSecret;
  await controller.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await controller.command({ type: 'connectPeer', endpoint, secret: oldSecret });
  await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config: screenConfig() });
  await vi.waitFor(() => expect(display.state.audience('screen-one').entries[0]?.state).toBe('live'), {
    timeout: 5000,
  });
  await controller.command({
    type: 'apply',
    nodeId: display.identity.sourceId,
    config: { ...screenConfig(2), standby: true },
  });
  expect(display.state.audience('screen-one').config.standby).toBe(true);
  await controller.command({ type: 'identify', nodeId: display.identity.sourceId, screenId: 'screen-one' });
  expect(display.state.audience('screen-one').identifyUntil).toBeGreaterThan(Date.now());
  await display.command({ type: 'revokeController' });
  await expect(
    requestVista(
      endpoint,
      oldSecret,
      'POST',
      '/vista/v1/display/identify',
      {
        controllerId: controller.identity.sourceId,
        controllerGeneration: controller.state.document.generation,
        screenId: 'screen-one',
      },
      display.identity.sourceId,
    ),
  ).rejects.toThrow();
  expect(display.view().local.controllerId).toBeNull();
});

it('isolates a replacement controller cache conflict and restores healthy remote updates after restart', async () => {
  const controller = await start();
  const scheduled = await pausePolling(controller);
  const directory = await mkdtemp(join(tmpdir(), 'vista-replacement-cache-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const first = screenConfig();
  const second = {
    ...screenConfig(),
    id: 'screen-two',
    monitorId: 'monitor-two',
    selections: [{ ...first.selections[0]!, sourceId: 'lane-two', subjectId: 'session-two' }],
  };
  const entry = (revision: number, healthy = false) => ({
    snapshot: {
      ...snapshot(revision),
      ...(healthy ? { sourceId: 'lane-two', subjectId: 'session-two' } : {}),
    },
    state: 'saved' as const,
    receivedAt: Date.now(),
    error: null,
  });
  const store = new AtomicStore(join(directory, 'vista.json'), DocumentSchema);
  await store.write({ ...newDocument(), screens: [first, second], snapshots: [entry(5), entry(1, true)] });
  const displayPort = desktop();
  displayPort.monitors = () => [
    { id: 'monitor-one', name: 'Monitor 1', width: 1920, height: 1080, primary: true },
    { id: 'monitor-two', name: 'Monitor 2', width: 1920, height: 1080, primary: false },
  ];
  let display: VistaApplication | null = await VistaApplication.start(directory, displayPort);
  cleanup.push(async () => display?.stop());
  // The replacement has an older saved copy of one now-unavailable source.
  await controller.state.updateEntry(entry(1));
  await controller.state.updateEntry({ ...entry(2, true), state: 'live' });
  await controller.command({
    type: 'connectPeer',
    endpoint: `http://127.0.0.1:${display.state.document.port}`,
    secret: display.view().pairingSecret,
  });
  await scheduled.syncPeer(display.identity.sourceId);
  expect(display.state.audience(first.id).entries[0]).toMatchObject({
    snapshot: { revision: 5 },
    state: 'stale',
    error: expect.stringContaining('older source snapshot'),
  });
  expect(display.state.audience(second.id).entries[0]).toMatchObject({ snapshot: { revision: 2 }, state: 'live' });
  const remote = controller.view().peers[0]!;
  expect(remote.error).toBeNull();
  expect(remote.node?.screens.find(({ config }) => config.id === first.id)?.error).toContain('older source snapshot');
  expect(remote.node?.screens.find(({ config }) => config.id === second.id)?.error).toBeNull();
  await display.stop();
  display = await VistaApplication.start(directory, displayPort);
  expect(display.state.audience(first.id).entries[0]).toMatchObject({ snapshot: { revision: 5 }, state: 'saved' });
  expect(display.state.audience(second.id).entries[0]).toMatchObject({ snapshot: { revision: 2 }, state: 'saved' });
});

it.each(['stale', 'incomplete'] as const)(
  'reconfirms published competition results independently of %s target histories',
  async (fault) => {
    const current = { ...snapshot(), finished: true };
    current.participants[0]!.dataState = fault === 'stale' ? 'stale' : 'saved';
    current.participants[0]!.historyComplete = fault !== 'incomplete';
    current.ranking = {
      scope: 'Competition',
      kind: 'competition',
      revision: 'official-one',
      state: 'OFFICIAL',
      rows: [{ id: 'athlete-one', rank: 1, name: 'Athlete 1', affiliation: null, total: 610, classification: null }],
    };
    const server = await source(async () => current, 'director');
    const app = await start();
    await pausePolling(app);
    await app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
    await app.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
    const confirmed = app.view().snapshots[0]!;
    expect(confirmed.state).toBe('live');
    expect(publicationLabel(confirmed)).toBe('Competition ranking · Official');
    expect(confirmed.snapshot.participants).toEqual(current.participants);
    await app.command({ type: 'removeSource', id: 'lane-one' });
    expect(publicationLabel(app.view().snapshots[0]!)).toContain('publication unconfirmed');
  },
);

it('rejects reciprocal and nested controllers while the original controller keeps acquiring sources', async () => {
  let revision = 1;
  const server = await source(async () => snapshot(revision));
  const controller = await start();
  const display = await start();
  const other = await start();
  await controller.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await controller.command({
    type: 'connectPeer',
    endpoint: `http://127.0.0.1:${display.state.document.port}`,
    secret: display.view().pairingSecret,
  });
  await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config: screenConfig() });
  const controllerEndpoint = `http://127.0.0.1:${controller.state.document.port}`;
  await expect(
    display.command({ type: 'connectPeer', endpoint: controllerEndpoint, secret: controller.view().pairingSecret }),
  ).rejects.toThrow('managed remotely');
  await expect(
    other.command({ type: 'connectPeer', endpoint: controllerEndpoint, secret: controller.view().pairingSecret }),
  ).rejects.toThrow('manages other displays');
  expect(controller.state.document.controller).toBeNull();
  expect(display.state.document.peers).toEqual([]);
  expect(other.state.document.peers).toEqual([]);
  revision = 2;
  await vi.waitFor(() => expect(display.state.audience('screen-one').entries[0]?.snapshot.revision).toBe(2), {
    timeout: 5000,
  });
  expect(controller.view().sources[0]?.state).toBe('connected');
});

it('rechecks controller ownership before persisting an in-flight peer registration', async () => {
  const controller = await start();
  await pausePolling(controller);
  const display = await start();
  const owner = { controllerId: 'new-controller', controllerGeneration: 1 };
  const register = display.state.register.bind(display.state);
  vi.spyOn(display.state, 'register').mockImplementation(async (input, secret) => {
    await register(input, secret);
    await controller.state.register(owner);
  });
  await expect(
    controller.command({
      type: 'connectPeer',
      endpoint: `http://127.0.0.1:${display.state.document.port}`,
      secret: display.view().pairingSecret,
    }),
  ).rejects.toThrow('pairing was not saved here. Revoke remote control on that display PC');
  expect(controller.state.document.peers).toEqual([]);
  expect(controller.state.document.controller?.id).toBe(owner.controllerId);
  // A subsequent heartbeat from the accepted owner leaves that ownership intact.
  await controller.state.register(owner);
});

it('stops forwarding saved peers when a restored PC also has a registered controller', async () => {
  const controller = await start();
  const scheduled = await pausePolling(controller);
  const display = await start();
  await controller.state.updateEntry({ snapshot: snapshot(), state: 'live', receivedAt: Date.now(), error: null });
  await controller.command({
    type: 'connectPeer',
    endpoint: `http://127.0.0.1:${display.state.document.port}`,
    secret: display.view().pairingSecret,
  });
  await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config: screenConfig() });
  const receivedAt = display.state.audience('screen-one').entries[0]!.receivedAt;
  // Older documents may contain a cycle even though new registrations reject it.
  await controller.state.transact((document) => ({
    ...document,
    controller: { id: display.identity.sourceId, generation: display.state.document.generation },
  }));
  vi.spyOn(Date, 'now').mockReturnValue(receivedAt + 6000);
  await scheduled.syncPeer(display.identity.sourceId);
  expect(controller.view().peers[0]?.error).toContain('managed remotely');
  expect(display.state.audience('screen-one').entries[0]).toMatchObject({ receivedAt, state: 'stale' });
});

it.each(['existing', 'new'] as const)(
  'keeps healthy remote screens updating when the %s screen configuration cannot be applied',
  async (target) => {
    let revision = 1;
    const server = await source(async (subjectId) => ({ ...snapshot(revision), subjectId }), 'lane', [
      'session-one',
      'session-two',
    ]);
    const controller = await start();
    const displayPort = desktop();
    displayPort.monitors = () => [
      { id: 'monitor-one', name: 'Monitor 1', width: 1920, height: 1080, primary: true },
      { id: 'monitor-two', name: 'Monitor 2', width: 1920, height: 1080, primary: false },
    ];
    displayPort.status = () => ({ revision: 1, alive: true });
    const display = await start(displayPort);
    type ScheduledApplication = {
      timer: ReturnType<typeof setTimeout> | null;
      syncPeer(id: string): Promise<void>;
      activeTasks: Set<Promise<void>>;
      tick(): Promise<void>;
    };
    const scheduled = controller as unknown as ScheduledApplication;
    if (scheduled.timer) clearTimeout(scheduled.timer);
    const endpoint = display.view().endpoints.find((value) => value.includes('127.0.0.1'))!;
    await controller.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
    await controller.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
    await controller.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-two' });
    await controller.command({ type: 'connectPeer', endpoint, secret: display.view().pairingSecret });
    await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config: screenConfig() });
    const healthy = {
      ...screenConfig(),
      id: 'screen-two',
      monitorId: 'monitor-two',
      selections: [{ ...screenConfig().selections[0]!, subjectId: 'session-two' }],
    };
    await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config: healthy });
    const failed = {
      ...screenConfig(2),
      id: target === 'existing' ? 'screen-one' : 'screen-three',
      monitorId: 'missing-monitor',
      selections: [{ ...screenConfig().selections[0]!, subjectId: 'session-two' }],
    };
    await expect(
      controller.command({ type: 'apply', nodeId: display.identity.sourceId, config: failed }),
    ).rejects.toThrow('not connected');
    revision = 2;
    await scheduled.tick();
    if (scheduled.timer) clearTimeout(scheduled.timer);
    await Promise.all([...scheduled.activeTasks]);
    await scheduled.syncPeer(display.identity.sourceId);
    expect(display.state.audience(healthy.id).entries[0]?.snapshot.revision).toBe(2);
    expect(display.state.audience('screen-one').entries[0]?.snapshot).toMatchObject({
      subjectId: 'session-one',
      revision: 2,
    });
    const peer = controller.view().peers[0]!;
    expect(peer.error).toBeNull();
    expect(peer.node?.screens.find((screen) => screen.config.id === healthy.id)).toMatchObject({
      renderAlive: true,
      error: null,
    });
    expect(peer.node?.screens.find((screen) => screen.config.id === failed.id)).toMatchObject({
      config: failed,
      appliedRevision: target === 'existing' ? 1 : null,
      error: expect.stringContaining('not connected'),
    });
    await controller.command({
      type: 'apply',
      nodeId: display.identity.sourceId,
      config: { ...healthy, revision: 2, standby: true },
    });
    expect(display.state.audience(healthy.id).config.standby).toBe(true);
  },
);

it('retains the selected finished target when its source is removed', async () => {
  const server = await source(async () => ({ ...snapshot(), finished: true }));
  const app = await start();
  await app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: screenConfig() });
  await vi.waitFor(() => expect(app.view().snapshots[0]?.state).toBe('live'));
  await app.command({ type: 'removeSource', id: 'lane-one' });
  expect(app.state.audience('screen-one').entries[0]?.state).toBe('saved');
  expect(app.state.audience('screen-one').entries[0]?.snapshot.participants[0]?.total).toBe(10.2);
  await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: { ...screenConfig(2), standby: true } });
  await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: screenConfig(3) });
  expect(app.state.audience('screen-one').config.standby).toBe(false);
});

it('refreshes a source catalog after an active snapshot request spans its refresh deadline', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = Date.now();
  const subjects = ['session-one'];
  let hold = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const server = await source(
    async () => {
      if (hold) {
        entered();
        await gate;
      }
      return snapshot();
    },
    'lane',
    subjects,
  );
  const app = await start();
  const scheduled = app as unknown as {
    timer: ReturnType<typeof setTimeout> | null;
    activeTasks: Set<Promise<void>>;
    tick(): Promise<void>;
  };
  const tick = async () => {
    await scheduled.tick();
    if (scheduled.timer) clearTimeout(scheduled.timer);
  };
  if (scheduled.timer) clearTimeout(scheduled.timer);
  await app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: screenConfig() });
  await tick();
  await Promise.all([...scheduled.activeTasks]);
  hold = true;
  vi.setSystemTime(now + 4000);
  await tick();
  try {
    await waiting;
    subjects.push('session-two');
    vi.setSystemTime(now + 6000);
    await tick();
    release();
    await Promise.all([...scheduled.activeTasks]);
    vi.setSystemTime(now + 6200);
    await tick();
    await Promise.all([...scheduled.activeTasks]);
    expect(app.view().sources[0]?.catalog?.subjects.map(({ id }) => id)).toEqual(subjects);
  } finally {
    release();
    await Promise.all([...scheduled.activeTasks]);
  }
});

it('ignores a snapshot response that arrives after its source was disconnected', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let hold = false;
  const server = await source(async () => {
    if (!hold) return snapshot();
    entered();
    await gate;
    return snapshot(2);
  });
  const app = await start();
  const scheduled = app as unknown as {
    timer: ReturnType<typeof setTimeout> | null;
    activeTasks: Set<Promise<void>>;
    tick(): Promise<void>;
  };
  if (scheduled.timer) clearTimeout(scheduled.timer);
  await app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await app.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
  await app.command({ type: 'apply', nodeId: app.identity.sourceId, config: screenConfig() });
  hold = true;
  await scheduled.tick();
  if (scheduled.timer) clearTimeout(scheduled.timer);
  const pending = [...scheduled.activeTasks];
  try {
    await waiting;
    await app.command({ type: 'removeSource', id: 'lane-one' });
    release();
    await Promise.all(pending);
    const entry = app.state.audience('screen-one').entries[0];
    expect(entry?.state).toBe('saved');
    expect(entry?.snapshot.revision).toBe(1);
  } finally {
    release();
    await Promise.all(pending);
  }
});

it('does not resurrect a removed remote screen when an earlier state request finishes late', async () => {
  const controller = await start();
  const display = await start();
  type ScheduledApplication = {
    timer: ReturnType<typeof setTimeout> | null;
    syncPeer(id: string): Promise<void>;
    handleRemote(method: string, path: string, body: unknown): Promise<unknown>;
  };
  const scheduledController = controller as unknown as ScheduledApplication;
  const scheduledDisplay = display as unknown as ScheduledApplication;
  // Keep the production transport and persistence; control only the poll schedule.
  if (scheduledController.timer) clearTimeout(scheduledController.timer);
  if (scheduledDisplay.timer) clearTimeout(scheduledDisplay.timer);
  const endpoint = display.view().endpoints.find((value) => value.includes('127.0.0.1'))!;
  await controller.command({ type: 'connectPeer', endpoint, secret: display.view().pairingSecret });
  await controller.command({
    type: 'apply',
    nodeId: display.identity.sourceId,
    config: { ...screenConfig(), selections: [], standby: true },
  });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const handle = scheduledDisplay.handleRemote.bind(display);
  let hold = true;
  vi.spyOn(scheduledDisplay, 'handleRemote').mockImplementation(async (method, path, body) => {
    if (hold && method === 'GET' && path === '/vista/v1/display/state') {
      hold = false;
      entered();
      await gate;
    }
    return handle(method, path, body);
  });
  const pendingPoll = scheduledController.syncPeer(display.identity.sourceId);
  try {
    await waiting;
    const removal = controller.command({
      type: 'removeScreen',
      nodeId: display.identity.sourceId,
      screenId: 'screen-one',
    });
    // Before the fix removal completes while the earlier read is held, then that
    // read sees a missing screen and reapplies its obsolete desired configuration.
    await Promise.race([removal, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
    release();
    await Promise.all([pendingPoll, removal]);
    expect(controller.state.document.peers[0]?.desired).toEqual([]);
    expect(display.state.document.screens).toEqual([]);
  } finally {
    release();
    await pendingPoll;
  }
});

it.each([false, true])(
  'keeps replacement control after a local revocation overlaps remote release, duplicate=%s',
  async (duplicate) => {
    const display = await start();
    await pausePolling(display);
    const replacement = await start();
    await pausePolling(replacement);
    const endpoint = `http://127.0.0.1:${display.state.document.port}`;
    const oldSecret = display.view().pairingSecret;
    const owner = { controllerId: 'old-controller', controllerGeneration: 1 };
    await requestVista(endpoint, oldSecret, 'POST', '/vista/v1/display/register', owner, display.identity.sourceId);
    let allowWrite!: () => void;
    const gate = new Promise<void>((resolve) => {
      allowWrite = resolve;
    });
    let writeStarted!: () => void;
    const waiting = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const write = AtomicStore.prototype.write;
    const writeSpy = vi.spyOn(AtomicStore.prototype, 'write').mockImplementation(async function (
      this: AtomicStore<unknown>,
      value,
    ) {
      const document = DocumentSchema.parse(value);
      if (document.id === display.identity.sourceId && document.releasing) {
        writeStarted();
        await gate;
      }
      return write.call(this, value);
    });
    const release = () =>
      requestVista(endpoint, oldSecret, 'POST', '/vista/v1/display/release', owner, display.identity.sourceId).catch(
        () => undefined,
      );
    const releases = [release()];
    let revoke: Promise<void> | undefined;
    try {
      await waiting;
      if (duplicate) releases.push(release());
      revoke = display.command({ type: 'revokeController' });
      // Keep persistence pending while the local command and any duplicate arrive.
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      allowWrite();
      await revoke;
      const replacementSecret = display.view().pairingSecret;
      await replacement.command({ type: 'connectPeer', endpoint, secret: replacementSecret });
      await Promise.all(releases);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      expect(display.state.document.controller?.id).toBe(replacement.identity.sourceId);
      expect(display.view().pairingSecret).toBe(replacementSecret);
      await requestVista(
        endpoint,
        replacementSecret,
        'GET',
        '/vista/v1/display/state',
        undefined,
        display.identity.sourceId,
      );
    } finally {
      allowWrite();
      await Promise.allSettled([...releases, revoke]);
      writeSpy.mockRestore();
    }
  },
);

it('acknowledges controller release and then rejects the old pairing secret', async () => {
  const controller = await start();
  const display = await start();
  const endpoint = display.view().endpoints.find((value) => value.includes('127.0.0.1'))!;
  const oldSecret = display.view().pairingSecret;
  await controller.command({ type: 'connectPeer', endpoint, secret: oldSecret });
  await controller.command({ type: 'removePeer', id: display.identity.sourceId });
  expect(controller.state.document.peers).toEqual([]);
  expect(display.state.document.controller).toBeNull();
  await expect(
    requestVista(
      endpoint,
      oldSecret,
      'POST',
      '/vista/v1/display/register',
      {
        controllerId: controller.identity.sourceId,
        controllerGeneration: controller.state.document.generation,
      },
      display.identity.sourceId,
    ),
  ).rejects.toThrow();
  await vi.waitFor(() => expect(display.view().pairingSecret).not.toBe(oldSecret));
  await expect(
    requestVista(endpoint, oldSecret, 'GET', '/vista/v1/display/state', undefined, display.identity.sourceId),
  ).rejects.toThrow();
});

it.each([false, true])('repairs pairing without reviving requests from revoked authority=%s', async (revoked) => {
  const controller = await start();
  const scheduled = controller as unknown as {
    timer: ReturnType<typeof setTimeout> | null;
    syncPeer(id: string): Promise<void>;
  };
  if (scheduled.timer) clearTimeout(scheduled.timer);
  const directory = await mkdtemp(join(tmpdir(), 'vista-pairing-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  let display: VistaApplication | null = await VistaApplication.start(directory, desktop());
  cleanup.push(async () => display?.stop());
  const endpoint = `http://127.0.0.1:${display.state.document.port}`;
  const id = display.identity.sourceId;
  const original = { ...screenConfig(), selections: [] };
  await controller.command({ type: 'connectPeer', endpoint, secret: display.view().pairingSecret });
  await controller.command({ type: 'apply', nodeId: id, config: original });
  await display.stop();
  display = null;
  const requested = { ...original, revision: 2, standby: true };
  await expect(controller.command({ type: 'apply', nodeId: id, config: requested })).rejects.toThrow();
  expect(controller.state.document.peers[0]?.desired).toEqual([requested]);
  display = await VistaApplication.start(directory, desktop());
  if (revoked) await display.command({ type: 'revokeController' });
  await controller.command({ type: 'connectPeer', endpoint, secret: display.view().pairingSecret });
  expect(controller.state.document.peers[0]?.desired).toEqual([revoked ? original : requested]);
  await scheduled.syncPeer(id);
  expect(display.state.document.screens).toEqual([revoked ? original : requested]);
});

it.each(['ranking', 'final', 'athlete'] as const)(
  'allows local standby for a saved Director %s screen after revoking remote control',
  async (view) => {
    const server = await source(async () => snapshot(), 'director');
    const controller = await start();
    const display = await start();
    await controller.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
    await controller.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
    await controller.command({
      type: 'connectPeer',
      endpoint: `http://127.0.0.1:${display.state.document.port}`,
      secret: display.view().pairingSecret,
    });
    const config = {
      ...screenConfig(),
      view: view === 'athlete' ? ('targets' as const) : view,
      selections: screenConfig().selections.map((selection) => ({
        ...selection,
        follow: view === 'athlete' ? ('athlete' as const) : ('lane' as const),
      })),
    };
    await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config });
    expect(display.state.audience(config.id).entries).toHaveLength(1);
    await display.command({ type: 'revokeController' });
    await display.command({
      type: 'apply',
      nodeId: display.identity.sourceId,
      config: { ...config, revision: 2, standby: true },
    });
    expect(display.state.audience(config.id).config.standby).toBe(true);
    await display.command({ type: 'apply', nodeId: display.identity.sourceId, config: { ...config, revision: 3 } });
    expect(display.state.audience(config.id).config.standby).toBe(false);
    await expect(
      display.command({
        type: 'apply',
        nodeId: display.identity.sourceId,
        config: { ...config, revision: 4, selections: [{ ...config.selections[0]!, sourceId: 'unconfirmed-source' }] },
      }),
    ).rejects.toThrow();
  },
);

it.each(['missing', 'unfinished', 'finished'] as const)('checks inherited %s data before resuming', async (data) => {
  const hasSavedData = data !== 'missing';
  const canResume = data === 'finished';
  const server = await source(async () => ({ ...snapshot(), finished: canResume }), 'director');
  const sourceCleanupIndex = cleanup.length - 1;
  const controller = await start();
  const scheduled = controller as unknown as { timer: ReturnType<typeof setTimeout> | null };
  if (scheduled.timer) clearTimeout(scheduled.timer);
  const display = await start();
  await controller.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  if (hasSavedData)
    await controller.command({ type: 'inspectSubject', sourceId: 'lane-one', subjectId: 'session-one' });
  const endpoint = `http://127.0.0.1:${display.state.document.port}`;
  const oldSecret = display.view().pairingSecret;
  await controller.command({ type: 'connectPeer', endpoint, secret: oldSecret });
  const config = { ...screenConfig(), view: 'ranking' as const };
  await controller.command({ type: 'apply', nodeId: display.identity.sourceId, config });
  await server.close();
  cleanup.splice(sourceCleanupIndex, 1);
  await controller.command({ type: 'removePeer', id: display.identity.sourceId });
  await vi.waitFor(() => expect(display.view().pairingSecret).not.toBe(oldSecret));

  const replacement = await start();
  await replacement.command({ type: 'connectPeer', endpoint, secret: display.view().pairingSecret });
  expect(replacement.view().sources).toEqual([]);
  expect(replacement.view().snapshots).toEqual([]);
  await replacement.command({
    type: 'apply',
    nodeId: display.identity.sourceId,
    config: { ...config, revision: 2, standby: true },
  });
  expect(display.state.audience(config.id).config.standby).toBe(true);
  expect(display.state.audience(config.id).entries).toHaveLength(hasSavedData ? 1 : 0);
  await expect(
    replacement.command({
      type: 'apply',
      nodeId: replacement.identity.sourceId,
      config: { ...config, revision: 3, standby: true },
    }),
  ).rejects.toThrow('Director');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
  if (hasSavedData) expect(display.state.audience(config.id).entries[0]?.state).toBe('stale');
  const resume = replacement.command({
    type: 'apply',
    nodeId: display.identity.sourceId,
    config: { ...config, revision: 3 },
  });
  if (canResume) {
    await resume;
    expect(display.state.audience(config.id).entries[0]?.snapshot).toMatchObject({
      subjectId: 'session-one',
      finished: true,
    });
  } else {
    await expect(resume).rejects.toThrow('Standby was retained');
  }
  expect(display.state.audience(config.id).config.standby).toBe(!canResume);
});

it.each([false, true])('requires a finished snapshot to resume stale local data (finished=%s)', async (finished) => {
  const app = await start();
  await app.state.updateEntry({
    snapshot: { ...snapshot(), finished },
    state: 'stale',
    receivedAt: Date.now() - 10_000,
    error: 'Updates have stopped',
  });
  await app.command({
    type: 'apply',
    nodeId: app.identity.sourceId,
    config: { ...screenConfig(), standby: true },
  });
  const resume = app.command({ type: 'apply', nodeId: app.identity.sourceId, config: screenConfig(2) });
  if (finished) await resume;
  else await expect(resume).rejects.toThrow('Standby was retained');
  expect(app.state.audience('screen-one').config.standby).toBe(!finished);
});
