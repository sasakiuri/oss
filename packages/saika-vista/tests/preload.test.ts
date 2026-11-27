// SPDX-License-Identifier: MIT
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VistaBridge } from '../src/shared/model';
import type { UpdateBridge } from '../src/shared/updateBridge';

import { updateState } from './updateFixtures';

type Listener = (event: unknown, input?: unknown) => void;
const electron = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  listeners: new Map<string, Set<(event: unknown, input?: unknown) => void>>(),
  invoke: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (name: string, api: unknown) => electron.exposed.set(name, api) },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: Listener) => {
      const listeners = electron.listeners.get(channel) ?? new Set();
      electron.listeners.set(channel, listeners.add(listener));
    },
    removeListener: (channel: string, listener: Listener) => electron.listeners.get(channel)?.delete(listener),
  },
}));

function send(channel: string, input?: unknown): void {
  for (const listener of electron.listeners.get(channel) ?? []) listener({ sender: 'main' }, input);
}

let vista: VistaBridge;
let updates: UpdateBridge;
beforeAll(async () => {
  await import('../src/preload/preload');
  vista = electron.exposed.get('vista') as VistaBridge;
  updates = electron.exposed.get('vistaUpdates') as UpdateBridge;
});
beforeEach(() => {
  electron.invoke.mockReset();
});

describe('Vista preload bridge', () => {
  it('exposes only the Vista and update bridges', () => {
    expect([...electron.exposed.keys()]).toEqual(['vista', 'vistaUpdates']);
  });

  it('forwards each operator and audience request to its main-process channel', async () => {
    electron.invoke.mockResolvedValueOnce({ screens: [] });
    await expect(vista.getState()).resolves.toEqual({ screens: [] });
    await vista.command({ type: 'closeScreen', screenId: 'screen-one' });
    await vista.discover();
    await vista.getAudience();
    await vista.rendered(4);

    expect(electron.invoke.mock.calls).toEqual([
      ['vista:state'],
      ['vista:command', { type: 'closeScreen', screenId: 'screen-one' }],
      ['vista:discover'],
      ['vista:audience'],
      ['vista:rendered', 4],
    ]);
  });

  it('notifies change subscribers without passing the IPC event until they unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = vista.onChange(callback);

    send('vista:changed', { leaked: true });
    expect(callback).toHaveBeenCalledExactlyOnceWith();

    unsubscribe();
    send('vista:changed');
    expect(callback).toHaveBeenCalledOnce();
    expect(electron.listeners.get('vista:changed')?.size).toBe(0);
  });
});

describe('Vista preload update bridge', () => {
  it('validates the update state read or checked in the main process', async () => {
    electron.invoke.mockResolvedValueOnce(updateState).mockResolvedValueOnce({ ...updateState, status: 'checking' });

    await expect(updates.getState()).resolves.toEqual(updateState);
    await expect(updates.check()).resolves.toMatchObject({ status: 'checking' });
    expect(electron.invoke.mock.calls).toEqual([['vista:updates-state'], ['vista:updates-check']]);
  });

  it('rejects a malformed update state from the main process', async () => {
    electron.invoke.mockResolvedValueOnce({ status: 'unknown' });

    await expect(updates.getState()).rejects.toThrow();
  });

  it('asks the main process to install the downloaded update', async () => {
    await updates.install();

    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith('vista:updates-install');
  });

  it('delivers validated update changes until the subscriber unsubscribes', () => {
    const callback = vi.fn();
    const unsubscribe = updates.onChange(callback);

    send('vista:updates-changed', { ...updateState, status: 'checking' });
    expect(callback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'checking' }));
    expect(() => send('vista:updates-changed', { status: 'unknown' })).toThrow();
    expect(callback).toHaveBeenCalledOnce();

    unsubscribe();
    send('vista:updates-changed', updateState);
    expect(callback).toHaveBeenCalledOnce();
  });
});
