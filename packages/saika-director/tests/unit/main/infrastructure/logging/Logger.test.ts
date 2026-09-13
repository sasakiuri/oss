// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebugLogStore } from '@/main/infrastructure/logging/Logger';
import type { DebugLogEntry } from '@/shared/ipc/contracts/debug.contract';

describe('DebugLogStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retains the newest 1000 entries in insertion order when the log exceeds capacity', () => {
    const store = new DebugLogStore();
    const entries: DebugLogEntry[] = Array.from({ length: 1002 }, (_, index) => ({
      timestamp: index,
      direction: 'RX',
      raw: `Message ${index}`,
    }));
    for (const entry of entries.slice(0, 1000)) store.addEntry(entry);
    expect(store.getEntries()).toEqual(entries.slice(0, 1000));
    store.addEntry(entries[1000]!);
    store.addEntry(entries[1001]!);
    expect(store.getEntries()).toEqual(entries.slice(2));
  });

  it('returns independent entry arrays and clears the log without invalidating previous snapshots', () => {
    const store = new DebugLogStore();
    const entry: DebugLogEntry = { timestamp: 1, direction: 'LOG', raw: 'Started' };
    expect(store.getEntries()).toEqual([]);
    store.addEntry(entry);
    const snapshot = store.getEntries();
    store.getEntries().pop();
    expect(store.getEntries()).toEqual([entry]);
    store.clear();
    expect(store.getEntries()).toEqual([]);
    expect(snapshot).toEqual([entry]);
    store.addEntry({ timestamp: 2, direction: 'LOG', raw: 'Restarted' });
    expect(store.getEntries()).toEqual([{ timestamp: 2, direction: 'LOG', raw: 'Restarted' }]);
  });

  it('timestamps transport and application messages while preserving optional parsed details', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValueOnce(30);
    const store = new DebugLogStore();
    store.log('TX', 'Command', '{"command":"start"}');
    store.log('RX', 'Acknowledgement');
    store.log('LOG', 'Connected');
    expect(store.getEntries()).toEqual([
      { timestamp: 10, direction: 'TX', raw: 'Command', parsed: '{"command":"start"}' },
      { timestamp: 20, direction: 'RX', raw: 'Acknowledgement', parsed: undefined },
      { timestamp: 30, direction: 'LOG', raw: 'Connected', parsed: undefined },
    ]);
  });
});
