// SPDX-License-Identifier: MIT
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import type { VistaIdentity, VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';
import { createVistaServer, type VistaServer } from '@sasakiuri/saika-protocol/vista-node';
import { expect, it, vi } from 'vitest';

import { AtomicStore } from '../src/main/AtomicStore';
import { DocumentSchema } from '../src/main/document';
import { VistaApplication, type DesktopPort } from '../src/main/VistaApplication';
import type { ScreenConfig, SnapshotEntry } from '../src/shared/model';
import { SnapshotEntrySchema } from '../src/shared/model';

import { screenConfig, snapshot } from './fixtures';

const LANES = 100;
const HISTORY = 60;
const BURSTS = 10;
const PERIOD_MS = 1000;
const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? 0;
const round = (value: number) => Math.round(value * 100) / 100;

type Lane = {
  identity: VistaIdentity;
  secret: string;
  current: VistaSnapshot;
  server: VistaServer | null;
  published: Map<number, number>;
};
function createLane(index: number): Lane {
  const sourceId = `load-lane-${index}`;
  const current = snapshot();
  current.sourceId = sourceId;
  current.subjectId = `load-session-${index}`;
  current.label = `Load lane ${index + 1}`;
  const participant = current.participants[0]!;
  participant.id = `load-athlete-${index}`;
  participant.laneId = sourceId;
  participant.laneName = `Lane ${index + 1}`;
  participant.name = `Athlete ${index + 1}`;
  participant.currentSeries = 5;
  participant.shotCount = HISTORY;
  const shot = participant.shots[0]!;
  participant.shots = Array.from({ length: HISTORY }, (_, i) => ({
    ...shot,
    id: `${sourceId}-shot-${i}`,
    sequence: i + 1,
    series: Math.floor(i / 10),
    x: (((i + index) % 17) - 8) / 2,
    y: (((i * 3 + index) % 19) - 9) / 2,
    score: 9 + (i % 20) / 10,
  }));
  recompute(current);
  return {
    identity: {
      protocolVersion: 1,
      sourceId,
      bootId: `load-boot-${index}`,
      kind: 'lane',
      name: `Load Lane ${index + 1}`,
    },
    secret: randomBytes(32).toString('base64url'),
    current,
    server: null,
    published: new Map([[1, Date.now()]]),
  };
}
function recompute(current: VistaSnapshot): void {
  const participant = current.participants[0]!;
  participant.total = round(participant.shots.reduce((sum, shot) => sum + (shot.score ?? 0), 0));
  participant.series = Array.from({ length: 6 }, (_, index) => ({
    stage: 0,
    index,
    total: round(
      participant.shots.filter((shot) => shot.series === index).reduce((sum, shot) => sum + (shot.score ?? 0), 0),
    ),
  }));
}
async function listen(lane: Lane, port?: number): Promise<void> {
  lane.server = await createVistaServer({
    identity: lane.identity,
    secret: lane.secret,
    port,
    handle: (method, path) => {
      if (method !== 'GET') throw new Error('Read-only source');
      if (path.endsWith('/catalog'))
        return {
          identity: lane.identity,
          subjects: [
            {
              id: lane.current.subjectId,
              label: lane.current.label,
              eventCode: 'AR60',
              competition: null,
              relay: null,
              availability: 'available',
              reason: null,
            },
          ],
        };
      if (path.endsWith(`/snapshot/${lane.current.subjectId}`)) return { ...lane.current, capturedAt: Date.now() };
      throw new Error('Unknown load-test subject');
    },
  });
}
function publish(lanes: Lane[]): void {
  for (const lane of lanes) {
    const current = structuredClone(lane.current);
    current.revision += 1;
    const shot = current.participants[0]!.shots[(current.revision - 2) % HISTORY]!;
    // Correction bursts exercise replacement while preserving all 60 stable shot IDs.
    shot.score = round(9 + (current.revision % 20) / 10);
    shot.corrected = true;
    shot.x = (shot.x ?? 0) + 0.1;
    recompute(current);
    lane.current = current;
    lane.published.set(current.revision, Date.now());
  }
}
async function until(predicate: () => boolean, label: string, timeout = 8000): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await pause(20);
  }
}

it('acquires 100 encrypted Lane sources, durably publishes steady bursts, and isolates disconnects', async () => {
  const started = performance.now();
  const initialMemory = process.memoryUsage();
  const lanes = Array.from({ length: LANES }, (_, index) => createLane(index));
  const directory = await mkdtemp(join(tmpdir(), 'vista-100-lanes-'));
  const screens: ScreenConfig[] = [];
  const opened = new Set<string>();
  const desktop: DesktopPort = {
    monitors: () =>
      Array.from({ length: LANES }, (_, index) => ({
        id: `load-monitor-${index}`,
        name: `Monitor ${index + 1}`,
        width: 1920,
        height: 1080,
        primary: index === 0,
      })),
    open: (config) => {
      opened.add(config.id);
    },
    close: (id) => {
      opened.delete(id);
    },
    status: () => ({ revision: null, alive: false }),
    loginStart: async () => undefined,
    changed: () => undefined,
  };
  const storeWrites = vi.spyOn(AtomicStore.prototype, 'write');
  let app: VistaApplication | undefined;
  const receiveToDurable: number[] = [];
  const publishToReceive: number[] = [];
  const measured = new Set<string>();
  const violations: string[] = [];
  const lastRevision = new Map<string, number>();
  let measuring = false;
  let peakRss = initialMemory.rss;
  let memoryAfterInitial = initialMemory;
  let initialSyncMs = 0;
  let idleWrites = -1;
  let disconnectUnchanged = false;
  let disconnectPeerProgressMs = 0;
  let recoveryMs = 0;
  let durableWrites = 0;
  const collectWrites = () => {
    durableWrites += storeWrites.mock.calls.length;
    storeWrites.mockClear();
  };
  let restoreObserver: () => void = () => undefined;
  try {
    await Promise.all(lanes.map((lane) => listen(lane)));
    app = await VistaApplication.start(directory, desktop);
    const application = app;
    // Observe the real acquisition boundary; retain production batching, validation,
    // fsync, atomic rename and selected audience state publication.
    const update = application.state.updateEntry.bind(application.state);
    const observer = vi.spyOn(application.state, 'updateEntry').mockImplementation(async (entry: SnapshotEntry) => {
      const entered = performance.now();
      const result = await update(entry);
      // Mock call histories would otherwise retain every complete polled snapshot
      // and distort the process memory observation. No assertion uses spy calls.
      observer.mockClear();
      if (entry.state !== 'live') return result;
      const sourceId = entry.snapshot.sourceId;
      const current = application.state.getEntries().find((candidate) => candidate.snapshot.sourceId === sourceId);
      if (!current) {
        violations.push(`Accepted source missing: ${sourceId}`);
        return result;
      }
      if (current.snapshot.revision < (lastRevision.get(sourceId) ?? 0))
        violations.push(`Revision regressed: ${sourceId}`);
      lastRevision.set(sourceId, current.snapshot.revision);
      const participant = current.snapshot.participants[0]!;
      if (
        participant.shots.length !== HISTORY ||
        new Set(participant.shots.map((shot) => shot.id)).size !== HISTORY ||
        !participant.historyComplete
      )
        violations.push(`History changed unexpectedly: ${sourceId}`);
      if (current.snapshot.revision !== entry.snapshot.revision)
        violations.push(`Accepted revision replaced before observation: ${sourceId}`);
      const selected = screens.find((config) => config.selections.some((selection) => selection.sourceId === sourceId));
      const audience =
        selected &&
        application.state.audience(selected.id).entries.find((candidate) => candidate.snapshot.sourceId === sourceId);
      if (!audience || audience.snapshot.revision !== entry.snapshot.revision)
        violations.push(`Audience did not publish durable revision: ${sourceId}`);
      const sampleKey = `${sourceId}:${entry.snapshot.revision}`;
      if (!measuring || entry.snapshot.revision <= 1 || measured.has(sampleKey)) return result;
      measured.add(sampleKey);
      // receivedAt is stamped after authenticated transport and schema validation.
      receiveToDurable.push(Math.max(Date.now() - entry.receivedAt, performance.now() - entered));
      const lane = lanes.find((candidate) => candidate.identity.sourceId === sourceId)!;
      publishToReceive.push(entry.receivedAt - lane.published.get(entry.snapshot.revision)!);
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      return result;
    });
    restoreObserver = () => observer.mockRestore();
    for (const lane of lanes)
      await application.command({
        type: 'connectSource',
        endpoint: `http://127.0.0.1:${lane.server!.port}`,
        secret: lane.secret,
      });
    const configurationStarted = performance.now();
    for (let index = 0; index < LANES; index += 1) {
      // 96 individual outputs + four 25-lane grids use exactly 100 fake monitors.
      const selectedLanes = index < 96 ? [lanes[index]!] : lanes.slice((index - 96) * 25, (index - 95) * 25);
      const config: ScreenConfig = {
        ...screenConfig(),
        id: `load-screen-${index}`,
        monitorId: `load-monitor-${index}`,
        name: `Load screen ${index + 1}`,
        slots: index < 96 ? 1 : 25,
        autoRotate: false,
        selections: selectedLanes.map((lane) => ({
          sourceId: lane.identity.sourceId,
          subjectId: lane.current.subjectId,
          participantIds: [lane.identity.sourceId],
          follow: 'lane',
          label: '',
        })),
      };
      screens.push(config);
      await application.command({ type: 'apply', nodeId: application.identity.sourceId, config });
    }
    const synchronized = (targets: Lane[]) =>
      targets.every((lane) =>
        application.state
          .getEntries()
          .some(
            (entry) =>
              entry.snapshot.sourceId === lane.identity.sourceId &&
              entry.state === 'live' &&
              entry.snapshot.revision === lane.current.revision,
          ),
      );
    await until(() => synchronized(lanes), 'initial 100-source synchronization', 15000);
    initialSyncMs = performance.now() - configurationStarted;
    expect(opened.size).toBe(LANES);
    expect(application.state.getEntries()).toHaveLength(LANES);
    expect(
      application.node().screens.every((status) => status.appliedRevision === 1 && status.renderedRevision === null),
    ).toBe(true);
    expect(screens.slice(-4).map((config) => application.state.audience(config.id).entries.length)).toEqual([
      25, 25, 25, 25,
    ]);
    expect(violations).toEqual([]);
    await application.state.flush();
    collectWrites();
    const idleBaseline = storeWrites.mock.calls.length;
    await pause(1200);
    await application.state.flush();
    idleWrites = storeWrites.mock.calls.length - idleBaseline;
    expect(idleWrites, 'Unchanged revisions must refresh freshness without durable writes').toBe(0);
    collectWrites();
    memoryAfterInitial = process.memoryUsage();
    measuring = true;
    for (let burst = 0; burst < BURSTS; burst += 1) {
      const tickStarted = performance.now();
      publish(lanes);
      await until(() => synchronized(lanes), `steady burst ${burst + 1}`);
      await until(() => measured.size >= (burst + 1) * LANES, `measurement of burst ${burst + 1}`);
      expect(violations).toEqual([]);
      collectWrites();
      await pause(Math.max(0, PERIOD_MS - (performance.now() - tickStarted)));
    }
    expect(receiveToDurable).toHaveLength(LANES * BURSTS);
    expect(
      percentile(receiveToDurable, 0.95),
      'Steady-state received→durable audience p95 exceeds 1 second',
    ).toBeLessThan(1000);
    measuring = false;
    const disconnected = lanes[0]!;
    const retainedPort = disconnected.server!.port;
    const retainedRevision = disconnected.current.revision;
    await disconnected.server!.close();
    disconnected.server = null;
    const healthy = lanes.slice(1);
    const interruptionStarted = performance.now();
    publish(healthy);
    await until(() => synchronized(healthy), '99 healthy sources after disconnect', 4000);
    disconnectPeerProgressMs = performance.now() - interruptionStarted;
    expect(disconnectPeerProgressMs).toBeLessThan(4000);
    await until(
      () =>
        application.state.getEntries().find((entry) => entry.snapshot.sourceId === disconnected.identity.sourceId)
          ?.state === 'stale',
      'disconnected source state',
      6000,
    );
    const retained = application.state.audience('load-screen-0').entries[0]!;
    disconnectUnchanged =
      retained.snapshot.revision === retainedRevision && retained.snapshot.participants[0]!.shots.length === HISTORY;
    expect(disconnectUnchanged).toBe(true);
    expect(retained.state).toBe('stale');
    expect(
      healthy.every(
        (lane) =>
          application.state.getEntries().find((entry) => entry.snapshot.sourceId === lane.identity.sourceId)?.state ===
          'live',
      ),
    ).toBe(true);
    const recoveryStarted = performance.now();
    publish([disconnected]);
    // A new listener has a new challenge, even at the same identity and port.
    await listen(disconnected, retainedPort);
    await until(() => synchronized(lanes), 'source recovery on new listener challenge', 6000);
    recoveryMs = performance.now() - recoveryStarted;
    await application.state.flush();
    const persisted = DocumentSchema.parse(JSON.parse(await readFile(join(directory, 'vista.json'), 'utf8')));
    expect(persisted.snapshots).toHaveLength(LANES);
    const savedEntries = persisted.snapshots.map((entry) => SnapshotEntrySchema.parse(entry));
    for (const lane of lanes) {
      const stored = savedEntries.find((entry) => entry.snapshot.sourceId === lane.identity.sourceId)!;
      expect(stored.snapshot.revision).toBe(lane.current.revision);
      expect(stored.snapshot.participants[0]!.shots).toEqual(lane.current.participants[0]!.shots);
      expect(stored.snapshot.participants[0]!.total).toBe(lane.current.participants[0]!.total);
    }
    expect(violations).toEqual([]);
  } finally {
    const finalMemory = process.memoryUsage();
    console.info(
      'VISTA_100_LANE_LOAD',
      JSON.stringify({
        sources: LANES,
        screens: LANES,
        historyPerLane: HISTORY,
        steadyBursts: BURSTS,
        samples: receiveToDurable.length,
        initialConfigurationAndSyncMs: round(initialSyncMs),
        elapsedMs: round(performance.now() - started),
        receivedToDurableAudienceMs: {
          p50: round(percentile(receiveToDurable, 0.5)),
          p95: round(percentile(receiveToDurable, 0.95)),
          max: round(Math.max(0, ...receiveToDurable)),
        },
        sourcePublicationToReceiveMs: {
          p50: round(percentile(publishToReceive, 0.5)),
          p95: round(percentile(publishToReceive, 0.95)),
          max: round(Math.max(0, ...publishToReceive)),
        },
        idleDurableWrites: idleWrites,
        durableWritesTotal: durableWrites + storeWrites.mock.calls.length,
        disconnectRetainedHistory: disconnectUnchanged,
        healthy99ProgressMs: round(disconnectPeerProgressMs),
        recoveryMs: round(recoveryMs),
        memoryMiB: {
          startRss: round(initialMemory.rss / 2 ** 20),
          afterInitialRss: round(memoryAfterInitial.rss / 2 ** 20),
          peakObservedRss: round(Math.max(peakRss, finalMemory.rss) / 2 ** 20),
          finalRss: round(finalMemory.rss / 2 ** 20),
          afterInitialHeap: round(memoryAfterInitial.heapUsed / 2 ** 20),
          finalHeap: round(finalMemory.heapUsed / 2 ** 20),
        },
        limitations:
          'Loopback encrypted transport and real durable store; synthetic Lane snapshots and monitor port; no physical rendering, multi-PC network, RSS leak proof, or 12-hour soak.',
      }),
    );
    restoreObserver();
    await app?.stop();
    await Promise.all(lanes.map((lane) => lane.server?.close()));
    storeWrites.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
