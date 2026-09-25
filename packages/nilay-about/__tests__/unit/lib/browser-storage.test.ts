import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  browserStorage,
  collectDiscardedSaves,
  reportDiscardedSave,
  useDiscardedSave,
  useStorageStatus,
} from '@/lib/browser-storage';

const KEY = 'nilay-labs-test-v1';

describe('browserStorage', () => {
  beforeEach(() => {
    useStorageStatus.setState({ available: true, discarded: [] });
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads back what it wrote', () => {
    browserStorage.setItem(KEY, { state: { a: 1 }, version: 0 });
    expect(browserStorage.getItem(KEY)).toEqual({ state: { a: 1 }, version: 0 });
    expect(useStorageStatus.getState()).toEqual({ available: true, discarded: [] });
  });

  it('treats an absent value as nothing stored, without reporting a loss', () => {
    expect(browserStorage.getItem(KEY)).toBeNull();
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('reports a value that is not JSON instead of starting over in silence', () => {
    window.localStorage.setItem(KEY, '{broken');
    expect(browserStorage.getItem(KEY)).toBeNull();
    expect(useStorageStatus.getState().discarded).toEqual([KEY]);
    // The value is unreadable, not the storage itself.
    expect(useStorageStatus.getState().available).toBe(true);
  });

  it('reports JSON that is not a persisted envelope, which persist would drop just as quietly', () => {
    for (const raw of ['{"oops":1}', '"hello"', '123', 'null', '[]']) {
      useStorageStatus.setState({ available: true, discarded: [] });
      window.localStorage.setItem(KEY, raw);
      expect(browserStorage.getItem(KEY)).toBeNull();
      expect(useStorageStatus.getState().discarded).toEqual([KEY]);
    }
  });

  it('clears the key once the value reads again, so the notice cannot outlive the problem', () => {
    window.localStorage.setItem(KEY, '{broken');
    browserStorage.getItem(KEY);
    expect(useStorageStatus.getState().discarded).toEqual([KEY]);

    browserStorage.setItem(KEY, { state: { a: 1 }, version: 0 });
    expect(browserStorage.getItem(KEY)).toEqual({ state: { a: 1 }, version: 0 });
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('leaves another tool key alone when one key reads again', () => {
    reportDiscardedSave('nilay-labs-other-v1');
    browserStorage.setItem(KEY, { state: {}, version: 0 });
    browserStorage.getItem(KEY);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-v1']);
  });

  it('marks storage unavailable when the browser refuses a read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(browserStorage.getItem(KEY)).toBeNull();
    expect(useStorageStatus.getState().available).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('marks storage unavailable when a write or a removal fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    browserStorage.setItem(KEY, { state: {}, version: 0 });
    expect(useStorageStatus.getState().available).toBe(false);

    useStorageStatus.setState({ available: true });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    browserStorage.removeItem(KEY);
    expect(useStorageStatus.getState().available).toBe(false);
  });

  it('lets a value that cannot be serialised throw, rather than blaming the storage', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => browserStorage.setItem(KEY, circular)).toThrow();
    expect(useStorageStatus.getState().available).toBe(true);
  });

  it('clears the unavailable flag once a write lands again', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    browserStorage.setItem(KEY, { state: {}, version: 0 });
    expect(useStorageStatus.getState().available).toBe(false);

    setItem.mockRestore();
    browserStorage.setItem(KEY, { state: {}, version: 0 });
    expect(useStorageStatus.getState().available).toBe(true);
  });

  it('keeps the discarded key once it is raised, so a tool can still say so', () => {
    reportDiscardedSave(KEY);
    browserStorage.setItem(KEY, { state: {}, version: 0 });
    expect(useStorageStatus.getState().discarded).toEqual([KEY]);
  });

  it('speaks only for the key whose value could not be read', () => {
    window.localStorage.setItem(KEY, '{broken');
    browserStorage.getItem(KEY);
    expect(useStorageStatus.getState().discarded).toEqual([KEY]);
    expect(renderHook(() => useDiscardedSave(KEY)).result.current).toBe(true);
    expect(renderHook(() => useDiscardedSave('nilay-labs-other-v1')).result.current).toBe(false);
  });

  it('records a key once, however often it is reported', () => {
    reportDiscardedSave(KEY);
    reportDiscardedSave(KEY);
    reportDiscardedSave('nilay-labs-other-v1');
    expect(useStorageStatus.getState().discarded).toEqual([KEY, 'nilay-labs-other-v1']);
  });
});

describe('collectDiscardedSaves', () => {
  it('returns what a check reported, without raising or clearing a notice', () => {
    useStorageStatus.setState({ available: true, discarded: ['open-tool'] });
    const reports = collectDiscardedSaves(() => {
      reportDiscardedSave('checked-key');
      reportDiscardedSave('open-tool');
    });
    expect([...reports].sort()).toEqual(['checked-key', 'open-tool']);
    expect(useStorageStatus.getState().discarded).toEqual(['open-tool']);
    // Once the check is over, reports are notices again.
    reportDiscardedSave('later');
    expect(useStorageStatus.getState().discarded).toEqual(['open-tool', 'later']);
  });

  it('stops collecting even when the check throws', () => {
    useStorageStatus.setState({ available: true, discarded: [] });
    expect(() =>
      collectDiscardedSaves(() => {
        throw new Error('broken');
      }),
    ).toThrow('broken');
    reportDiscardedSave('after');
    expect(useStorageStatus.getState().discarded).toEqual(['after']);
  });
});
