// SPDX-License-Identifier: MIT
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AtomicStore } from '../src/main/AtomicStore';
import { DisplayState } from '../src/main/DisplayState';
import { DocumentSchema, newDocument } from '../src/main/document';
import { VistaApplication, type DesktopPort } from '../src/main/VistaApplication';
import type { SnapshotEntry } from '../src/shared/model';

import { screenConfig, snapshot } from './fixtures';

let directory: string;
let file: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vista-isolation-'));
  file = join(directory, 'vista.json');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

const entry = (revision = 1): SnapshotEntry => ({
  snapshot: snapshot(revision),
  state: 'live',
  receivedAt: Date.now(),
  error: null,
});
const healthy = (revision = 1): SnapshotEntry => ({
  ...entry(revision),
  snapshot: { ...snapshot(revision), subjectId: 'healthy-session' },
});
const faults = ['missing', 'type', 'range', 'version', 'identity', 'score-precision'] as const;
const receivedFaults = [...faults, 'non-finite', 'null'] as const;
function invalidEntry(fault: (typeof receivedFaults)[number]): unknown {
  const original = entry(2);
  if (fault === 'null') return null;
  if (fault === 'non-finite') {
    original.snapshot.participants[0]!.shots[0]!.x = Infinity;
    return original;
  }
  if (fault === 'score-precision') {
    original.snapshot.participants[0]!.shots[0]!.score = 10.04;
    return original;
  }
  if (fault === 'missing') {
    const incomplete: Record<string, unknown> = { ...original.snapshot };
    delete incomplete.participants;
    return { ...original, snapshot: incomplete };
  }
  if (fault === 'type') return { ...original, snapshot: { ...original.snapshot, participants: 'invalid' } };
  if (fault === 'version') return { ...original, snapshot: { ...original.snapshot, protocolVersion: 9000 } };
  if (fault === 'identity') return { ...original, snapshot: { ...original.snapshot, sourceId: null } };
  return {
    ...original,
    snapshot: {
      ...original.snapshot,
      participants: [{ ...original.snapshot.participants[0]!, currentStage: 99 }],
    },
  };
}
const config = () => ({
  ...screenConfig(),
  selections: [...screenConfig().selections, { ...screenConfig().selections[0]!, subjectId: 'healthy-session' }],
});
const monitors = [{ id: 'monitor-one', name: 'Monitor', width: 1920, height: 1080, primary: true }];
async function restore() {
  const store = new AtomicStore(file, DocumentSchema);
  return { state: new DisplayState(await store.read(newDocument), store, vi.fn()), store };
}

it.each(faults)(
  'isolates a saved snapshot with invalid %s and preserves its original through recovery and restart',
  async (fault) => {
    const raw = invalidEntry(fault);
    await writeFile(file, JSON.stringify({ ...newDocument(), screens: [config()], snapshots: [healthy(), raw] }));
    const { state } = await restore();
    expect(state.audience('screen-one').entries).toHaveLength(1);
    expect(state.getEntries()[0]).toMatchObject({ state: 'saved', snapshot: { subjectId: 'healthy-session' } });
    expect(state.snapshotErrors()).toContain(
      fault === 'identity' ? 'entry 2 (identity unavailable)' : 'lane-one / session-one',
    );

    await state.apply({ ...config(), revision: 2, name: 'Updated screen' }, monitors);
    await state.updateEntry(healthy(2));
    expect(JSON.parse(await readFile(file, 'utf8')).snapshots).toContainEqual(raw);
    const restarted = (await restore()).state;
    expect(restarted.document.screens[0]?.name).toBe('Updated screen');
    expect(restarted.getEntries()[0]?.snapshot.revision).toBe(2);
    expect(restarted.snapshotErrors()).not.toBeNull();

    await restarted.updateEntry(entry(3));
    expect(restarted.getEntries().find((value) => value.snapshot.subjectId === 'session-one')).toMatchObject({
      state: 'live',
      snapshot: { revision: 3, participants: snapshot().participants },
    });
    expect(JSON.parse(await readFile(file, 'utf8')).snapshots).toContainEqual(raw);
    const recovered = (await restore()).state;
    expect(recovered.getEntries()).toHaveLength(2);
    expect(recovered.getEntries().find((value) => value.snapshot.subjectId === 'session-one')?.snapshot.revision).toBe(
      3,
    );
    const identityError = expect.stringContaining('identity unavailable');
    expect(recovered.snapshotErrors()).toEqual(fault === 'identity' ? identityError : null);
  },
);

it.each(receivedFaults)(
  'isolates a received snapshot with invalid %s and commits healthy subjects atomically',
  async (fault) => {
    const { state, store } = await restore();
    await state.apply(config(), monitors);
    const old = entry();
    await Promise.all([state.updateEntry(old), state.updateEntry(healthy())]);
    const owner = { controllerId: 'controller', controllerGeneration: 1 };
    await state.register(owner);
    const before = state.getEntries();
    const frame = {
      ...owner,
      sequence: 1,
      configs: [{ id: 'screen-one', revision: 1 }],
      entries: [invalidEntry(fault), healthy(2)],
    };
    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('Disk full'));
    await expect(state.receiveFrame(frame)).rejects.toThrow('Disk full');
    expect(state.getEntries()).toEqual(before);
    expect(state.snapshotErrors()).toBeNull();
    await state.receiveFrame(frame);
    expect(state.getEntries().find((value) => value.snapshot.subjectId === 'healthy-session')?.snapshot.revision).toBe(
      2,
    );
    const retained = state.getEntries().find((value) => value.snapshot.subjectId === 'session-one')!;
    expect(retained.snapshot).toEqual(old.snapshot);
    const identified = fault !== 'identity' && fault !== 'null';
    expect(state.snapshotErrors()).toContain(identified ? 'lane-one / session-one' : 'identity unavailable');
    const invalid = { state: 'stale', error: expect.stringContaining('is invalid') };
    expect(retained).toMatchObject(identified ? invalid : old);
    expect(
      (await restore()).state.getEntries().find((value) => value.snapshot.subjectId === 'session-one')?.snapshot,
    ).toEqual(old.snapshot);
    await expect(state.receiveFrame(frame)).rejects.toThrow('older display frame');

    await state.receiveFrame({ ...frame, sequence: 2, entries: [entry(3), healthy(3)] });
    expect(state.snapshotErrors()).toBeNull();
    expect(state.getEntries().every((value) => value.state === 'live' && value.error === null)).toBe(true);
  },
);

it.each(receivedFaults)(
  'rejects invalid %s through direct state updates while accepting a healthy batched subject',
  async (fault) => {
    const { state } = await restore();
    const old = entry();
    await state.updateEntry(old);
    const results = await Promise.allSettled([
      state.updateEntry(invalidEntry(fault) as SnapshotEntry),
      state.updateEntry(healthy(2)),
    ]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(state.getEntries().find((value) => value.snapshot.subjectId === 'session-one')).toEqual(old);
    expect(state.getEntries().find((value) => value.snapshot.subjectId === 'healthy-session')?.snapshot.revision).toBe(
      2,
    );
    const restored = (await restore()).state.getEntries();
    expect(restored).toHaveLength(2);
    expect(restored.find((value) => value.snapshot.subjectId === 'session-one')?.snapshot).toEqual(old.snapshot);
  },
);

it('clears a received subject error when a valid direct update recovers that subject', async () => {
  const { state } = await restore();
  await state.apply(config(), monitors);
  await state.updateEntry(entry());
  const owner = { controllerId: 'controller', controllerGeneration: 1 };
  await state.register(owner);
  await state.receiveFrame({
    ...owner,
    sequence: 1,
    configs: [{ id: 'screen-one', revision: 1 }],
    entries: [invalidEntry('range')],
  });
  expect(state.snapshotErrors()).toContain('is invalid');
  await state.updateEntry(entry(3));
  expect(state.snapshotErrors()).toBeNull();
  expect(state.getEntries()[0]).toMatchObject({ state: 'live', error: null });
});

it('keeps frame diagnostics until an ownership change is durable, then permits local recovery', async () => {
  const { state, store } = await restore();
  await state.apply(config(), monitors);
  await state.updateEntry(entry());
  const owner = { controllerId: 'controller', controllerGeneration: 1 };
  await state.register(owner);
  await state.receiveFrame({
    ...owner,
    sequence: 1,
    configs: [{ id: 'screen-one', revision: 1 }],
    entries: [invalidEntry('range'), null],
  });
  const failure = state.snapshotErrors();
  expect(failure).toContain('identity unavailable');
  vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('Disk full'));
  await expect(state.transact((document) => ({ ...document, controller: null }))).rejects.toThrow('Disk full');
  expect(state.snapshotErrors()).toBe(failure);
  await state.transact((document) => ({ ...document, controller: null }));
  await state.updateEntry(entry(3));
  expect(state.snapshotErrors()).toBeNull();
  expect(state.getEntries()[0]).toMatchObject({ state: 'live', error: null });
  expect((await restore()).state.getEntries()[0]?.error).toBeNull();
});

it.each([
  { version: 9000 },
  { secret: 123 },
  { controller: { id: 'controller', generation: 'invalid' } },
  { snapshots: {} },
  { screens: [null] },
])('preserves fatal document envelope and authority validation: %j', async (changes) => {
  const raw = JSON.stringify({ ...newDocument(), ...changes });
  await writeFile(file, raw);
  await expect(restore()).rejects.toThrow('not changed');
  expect(await readFile(file, 'utf8')).toBe(raw);
});

it('still rejects malformed JSON without replacing the saved file', async () => {
  await writeFile(file, '{');
  await expect(restore()).rejects.toThrow('not changed');
  expect(await readFile(file, 'utf8')).toBe('{');
});

it.each([
  { controllerId: 'intruder' },
  { controllerGeneration: 2 },
  { entries: {} },
  { sequence: -1 },
  { configs: [{ id: 'screen-one', revision: 2 }] },
  { entries: [{ ...healthy(), snapshot: { ...healthy().snapshot, subjectId: 'unselected' } }] },
])('rejects frame envelope, ownership and selection violations: %j', async (changes) => {
  const { state, store } = await restore();
  await state.apply(config(), monitors);
  const owner = { controllerId: 'controller', controllerGeneration: 1 };
  await state.register(owner);
  const writes = vi.spyOn(store, 'write');
  await expect(
    state.receiveFrame({
      ...owner,
      sequence: 1,
      configs: [{ id: 'screen-one', revision: 1 }],
      entries: [healthy(2)],
      ...changes,
    }),
  ).rejects.toThrow();
  expect(writes).not.toHaveBeenCalled();
  expect(state.getEntries()).toEqual([]);
});

it('starts audience screens and exposes isolated saved failures to the operator without blocking edits', async () => {
  const raw = invalidEntry('range');
  await writeFile(file, JSON.stringify({ ...newDocument(), screens: [config()], snapshots: [healthy(), raw, null] }));
  const desktop: DesktopPort = {
    monitors: () => monitors,
    open: vi.fn(),
    close: vi.fn(),
    status: () => ({ revision: 1, alive: true }),
    loginStart: async () => undefined,
    changed: vi.fn(),
  };
  const app = await VistaApplication.start(directory, desktop);
  try {
    expect(desktop.open).toHaveBeenCalledWith(config());
    expect(app.view().error).toContain('lane-one / session-one');
    expect(app.view().error).toContain('entry 3 (identity unavailable)');
    expect(app.node().screens[0]?.error).toContain('lane-one / session-one');
    expect(app.state.audience('screen-one').entries[0]?.snapshot.subjectId).toBe('healthy-session');
    await app.command({
      type: 'apply',
      nodeId: app.identity.sourceId,
      config: { ...config(), revision: 2, standby: true },
    });
    expect(app.node().screens[0]?.appliedRevision).toBe(2);
    const persisted = JSON.parse(await readFile(file, 'utf8'));
    expect(persisted.snapshots).toContainEqual(raw);
    expect(persisted.snapshots).toContain(null);
  } finally {
    await app.stop();
  }
});
