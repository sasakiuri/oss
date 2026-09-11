// SPDX-License-Identifier: MIT
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtomicStore } from '../src/main/AtomicStore';
import { DisplayState } from '../src/main/DisplayState';
import { DocumentSchema, newDocument } from '../src/main/document';

import { screenConfig, snapshot } from './fixtures';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vista-state-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

async function create() {
  const store = new AtomicStore(join(directory, 'vista.json'), DocumentSchema);
  const state = new DisplayState(await store.read(newDocument), store, vi.fn());
  return { state, store };
}
const monitors = [{ id: 'monitor-one', name: 'Monitor', width: 1920, height: 1080, primary: true }];

describe('durable display state', () => {
  it('restores settings, standby and the complete pinned target after restart without claiming live publication', async () => {
    const { state } = await create();
    await state.apply({ ...screenConfig(), standby: true }, monitors);
    await state.updateEntry({
      snapshot: { ...snapshot(), finished: true },
      state: 'live',
      receivedAt: Date.now(),
      error: null,
    });
    const { state: restarted } = await create();
    const audience = restarted.audience('screen-one');
    expect(audience.config.standby).toBe(true);
    expect(audience.entries[0]?.state).toBe('saved');
    expect(audience.entries[0]?.snapshot.participants[0]?.name).toBe('\u5c04\u6483 \u592a\u90ce');
    expect(audience.entries[0]?.snapshot.definition.target.shotDiameter).toBe(4.5);
  });

  it('rejects delayed settings and leaves durable settings unchanged when a write fails', async () => {
    const { state, store } = await create();
    await state.apply(screenConfig(2), monitors);
    await expect(state.apply({ ...screenConfig(1), name: 'Old screen' }, monitors)).rejects.toThrow('older');
    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('Disk full'));
    await expect(state.apply({ ...screenConfig(3), name: 'Unsaved screen' }, monitors)).rejects.toThrow('Disk full');
    expect(state.document.screens[0]?.name).toBe('North stand');
    expect((await create()).state.document.screens[0]?.revision).toBe(2);
  });

  it('keeps identification as an overlay over the newest configuration', async () => {
    const { state } = await create();
    await state.apply(screenConfig(), monitors);
    state.identifyScreen('screen-one');
    await state.apply({ ...screenConfig(2), standby: true }, monitors);
    expect(state.audience('screen-one').identifyUntil).toBeGreaterThan(Date.now());
    expect(state.audience('screen-one').config.standby).toBe(true);
  });

  it('never combines a new generation, conflicting revision, or new definition with pinned data', async () => {
    const { state } = await create();
    const entry = { snapshot: snapshot(3), state: 'live' as const, receivedAt: Date.now(), error: null };
    await state.updateEntry(entry);
    await expect(
      state.updateEntry({ ...entry, snapshot: { ...snapshot(4), generation: 'reset-two' } }),
    ).rejects.toThrow('generation');
    await expect(state.updateEntry({ ...entry, snapshot: snapshot(2) })).rejects.toThrow('older');
    const conflicting = snapshot(3);
    conflicting.participants[0]!.total = 99;
    await expect(state.updateEntry({ ...entry, snapshot: conflicting })).rejects.toThrow('Conflicting');
    const definition = snapshot(4);
    definition.definition.target.shotDiameter = 6;
    await expect(state.updateEntry({ ...entry, snapshot: definition })).rejects.toThrow('pinned definition');
    expect(state.getEntries()[0]?.snapshot.revision).toBe(3);
  });

  it('replaces corrections and withdrawals atomically without replay or duplication', async () => {
    const { state } = await create();
    const original = snapshot();
    const entry = { snapshot: original, state: 'live' as const, receivedAt: Date.now(), error: null };
    await state.updateEntry(entry);
    await state.updateEntry(entry);
    const corrected = snapshot(2);
    corrected.participants[0]!.shots = [];
    corrected.participants[0]!.shotCount = 0;
    corrected.participants[0]!.total = 0;
    await state.updateEntry({ ...entry, snapshot: corrected });
    expect(state.getEntries()).toHaveLength(1);
    expect(state.getEntries()[0]?.snapshot.participants[0]?.shots).toHaveLength(0);
    expect(state.getEntries()[0]?.snapshot.participants[0]?.total).toBe(0);
  });

  it('validates overlapping arrivals inside the persistence queue and batches independent lanes', async () => {
    const { state, store } = await create();
    const writes = vi.spyOn(store, 'write');
    const entry = (revision: number) => ({
      snapshot: snapshot(revision),
      state: 'live' as const,
      receivedAt: Date.now(),
      error: null,
    });
    const results = await Promise.allSettled([state.updateEntry(entry(2)), state.updateEntry(entry(1))]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(state.getEntries()[0]?.snapshot.revision).toBe(2);
    writes.mockClear();
    const start = performance.now();
    await Promise.all(
      Array.from({ length: 100 }, (_, index) => {
        const item = entry(1);
        item.snapshot.sourceId = `lane-${index}`;
        return state.updateEntry(item);
      }),
    );
    expect(writes).toHaveBeenCalledTimes(1);
    expect(state.getEntries()).toHaveLength(101);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('rejects a previously authenticated registration queued after pairing authority changes', async () => {
    const { state } = await create();
    const secret = state.document.secret;
    const rotation = state.transact((document) => ({ ...document, secret: 'b'.repeat(43), controller: null }));
    const registration = state.register({ controllerId: 'old-owner', controllerGeneration: 1 }, secret);
    await rotation;
    await expect(registration).rejects.toThrow('revoked');
    expect(state.document.controller).toBeNull();
  });

  it('rechecks source authority when a batched update reaches the persistence queue', async () => {
    const { state } = await create();
    const pending = state.updateEntry(
      { snapshot: snapshot(), state: 'live', receivedAt: Date.now(), error: null },
      () => state.document.controller === null,
    );
    await state.register({ controllerId: 'remote-owner', controllerGeneration: 1 });
    await pending;
    expect(state.getEntries()).toEqual([]);
    expect((await create()).state.getEntries()).toEqual([]);
  });

  it('fences old controllers, controller sessions and frame sequences', async () => {
    const { state } = await create();
    const owner = { controllerId: 'operator-one', controllerGeneration: 2 };
    await state.register(owner);
    await state.apply(screenConfig(), monitors, owner);
    await expect(state.register({ ...owner, controllerId: 'intruder' })).rejects.toThrow('Another controller');
    await expect(state.register({ ...owner, controllerGeneration: 1 })).rejects.toThrow('Another controller');
    const frame = {
      ...owner,
      sequence: 1,
      configs: [{ id: 'screen-one', revision: 1 }],
      entries: [{ snapshot: snapshot(), state: 'live', receivedAt: Date.now(), error: null }],
    };
    await state.receiveFrame(frame);
    await expect(state.receiveFrame(frame)).rejects.toThrow('older');
    await state.register({ ...owner, controllerGeneration: 3 });
    await expect(state.receiveFrame({ ...frame, sequence: 2 })).rejects.toThrow('not registered');
    await expect(state.apply(screenConfig(2), monitors)).rejects.toThrow('managed remotely');
  });

  it('rejects a frame for another configuration and avoids silently moving to a replacement monitor', async () => {
    const { state } = await create();
    await expect(state.apply({ ...screenConfig(), monitorId: 'new-monitor' }, monitors)).rejects.toThrow(
      'not connected',
    );
    const owner = { controllerId: 'operator', controllerGeneration: 1 };
    await state.register(owner);
    await state.apply(screenConfig(2), monitors, owner);
    await expect(
      state.receiveFrame({ ...owner, sequence: 1, configs: [{ id: 'screen-one', revision: 1 }], entries: [] }),
    ).rejects.toThrow('does not match');
  });

  it.each(['generation', 'conflicting revision', 'definition'] as const)(
    'preserves a subject with a rejected %s while durably accepting the other frame subjects',
    async (fault) => {
      const { state, store } = await create();
      const original = snapshot(3);
      const healthy = { ...snapshot(1), sourceId: 'lane-two', subjectId: 'session-two' };
      const entry = (value: ReturnType<typeof snapshot>) => ({
        snapshot: value,
        state: 'live' as const,
        receivedAt: Date.now(),
        error: null,
      });
      await state.apply(
        {
          ...screenConfig(),
          selections: [
            ...screenConfig().selections,
            { ...screenConfig().selections[0]!, sourceId: healthy.sourceId, subjectId: healthy.subjectId },
          ],
        },
        monitors,
      );
      await Promise.all([state.updateEntry(entry(original)), state.updateEntry(entry(healthy))]);
      const owner = { controllerId: 'replacement-controller', controllerGeneration: 1 };
      await state.register(owner);
      const rejected = snapshot(fault === 'conflicting revision' ? 3 : 4);
      if (fault === 'generation') rejected.generation = 'another-generation';
      if (fault === 'conflicting revision') rejected.participants[0]!.total = 99;
      if (fault === 'definition') rejected.definition.target.shotDiameter = 6;
      const frame = {
        ...owner,
        sequence: 1,
        configs: [{ id: 'screen-one', revision: 1 }],
        entries: [entry(rejected), entry({ ...healthy, revision: 2 })],
      };
      vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('Disk full'));
      await expect(state.receiveFrame(frame)).rejects.toThrow('Disk full');
      expect(state.getEntries().map(({ snapshot }) => snapshot.revision)).toEqual([3, 1]);
      await state.receiveFrame(frame);
      expect(state.getEntries()[0]).toMatchObject({ snapshot: original, state: 'stale', error: expect.any(String) });
      expect(state.getEntries()[1]?.snapshot.revision).toBe(2);
      const restored = (await create()).state.getEntries();
      expect(restored[0]?.snapshot).toEqual(original);
      expect(restored[1]?.snapshot.revision).toBe(2);
      await expect(state.receiveFrame(frame)).rejects.toThrow('older display frame');
    },
  );

  it.each([-60_000, 60_000])('uses local receipt time when the controller clock differs by %i ms', async (offset) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    const { state } = await create();
    const owner = { controllerId: 'operator', controllerGeneration: 1 };
    await state.register(owner);
    await state.apply(screenConfig(), monitors, owner);
    const sourceSnapshot = { ...snapshot(), capturedAt: now + offset };
    await state.receiveFrame({
      ...owner,
      sequence: 1,
      configs: [{ id: 'screen-one', revision: 1 }],
      entries: [{ snapshot: sourceSnapshot, state: 'live', receivedAt: now + offset, error: null }],
    });
    expect(state.audience('screen-one').entries[0]).toMatchObject({ state: 'live', receivedAt: now });
    expect(state.getEntries()[0]?.snapshot.capturedAt).toBe(now + offset);
    vi.setSystemTime(now + 3000);
    await state.receiveFrame({
      ...owner,
      sequence: 2,
      configs: [{ id: 'screen-one', revision: 1 }],
      entries: [],
    });
    vi.setSystemTime(now + 4500);
    expect(state.audience('screen-one').entries[0]?.state).toBe('stale');
  });

  it('preserves unsupported or damaged storage rather than overwriting it', async () => {
    const file = join(directory, 'vista.json');
    await writeFile(file, '{"version":9000}');
    await expect(create()).rejects.toThrow('not changed');
    expect(await readFile(file, 'utf8')).toBe('{"version":9000}');
  });
});
