import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIndexedDb } from '@/lib/indexed-db';

/** An open request whose events the test fires by hand. */
function fakeOpen() {
  const database = { close: vi.fn(), onversionchange: null as (() => void) | null, transaction: vi.fn() };
  const request = {
    result: database,
    error: null,
    transaction: null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onblocked: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null,
  };
  const open = vi.fn(() => request);
  vi.stubGlobal('indexedDB', { open });
  return { request, database, open };
}

describe('createIndexedDb', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('closes a connection that opens after the attempt was given up as blocked', async () => {
    const { request, database } = fakeOpen();
    const db = createIndexedDb({ name: 'test', version: 1, upgrade: () => undefined });
    const running = db.run('store', 'readonly', () => []);
    // The database is opened once the call has returned.
    await vi.waitFor(() => expect(request.onblocked).toBeTypeOf('function'));
    request.onblocked!();
    await expect(running).rejects.toThrow('blocked');
    request.onsuccess!();
    expect(database.close).toHaveBeenCalled();
  });

  it('opens again after a refusal', async () => {
    const first = fakeOpen();
    const db = createIndexedDb({ name: 'test', version: 1, upgrade: () => undefined });
    const running = db.run('store', 'readonly', () => []);
    await vi.waitFor(() => expect(first.request.onblocked).toBeTypeOf('function'));
    first.request.onblocked!();
    await expect(running).rejects.toThrow('blocked');
    const second = fakeOpen();
    void db.run('store', 'readonly', () => []).catch(() => undefined);
    await vi.waitFor(() => expect(second.open).toHaveBeenCalledTimes(1));
  });
});
