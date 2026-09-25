import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeIndexedDb } from '../support/fake-indexeddb';
import { installFakeLocks, type FakeLockManager } from '../support/fake-locks';

installFakeIndexedDb();

const KEY = 'nilay-labs-recoil-v1';
const saved = (velocity: number) => JSON.stringify({ state: { velocity }, version: 0 });
const JOURNAL = 'nilay-labs-restore-journal-v1';
const journal = () => ({
  token: '11111111-1111-4111-8111-111111111111',
  phase: 'staging',
  local: [{ key: KEY, before: saved(400), written: saved(500) }],
  photoTools: [],
  maps: false,
});

/** A fresh page: the session is module state, so each test loads the modules anew. */
async function page() {
  vi.resetModules();
  const session = await import('@/lib/labs-session');
  const { browserStorage } = await import('@/lib/browser-storage');
  return { session, browserStorage };
}

const settled = async <T>(promise: Promise<T> | T) => {
  let done = false;
  void Promise.resolve(promise).then(() => (done = true));
  for (let turn = 0; turn < 20; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
};

describe('the Labs session', () => {
  let locks: FakeLockManager;

  beforeEach(() => {
    window.localStorage.clear();
    locks = installFakeLocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });

  it('holds the shared lock from the first read, so a restore cannot start while a Labs page is open', async () => {
    window.localStorage.setItem(KEY, saved(400));
    const { browserStorage } = await page();
    expect(await browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
    expect(locks.holders('nilay-labs-open')).toEqual(['shared']);
    const restore = await locks.request('nilay-labs-open', { mode: 'exclusive', ifAvailable: true }, (lock) => lock);
    expect(restore).toBeNull();
  });

  it('makes a page opened during a restore wait before it reads anything', async () => {
    window.localStorage.setItem(KEY, saved(400));
    const release = locks.hold('nilay-labs-open', 'exclusive');
    const { browserStorage } = await page();
    const reading = browserStorage.getItem(KEY) as Promise<unknown>;
    expect(await settled(reading)).toBe(false);
    // The restore writes, then lets go.
    window.localStorage.setItem(KEY, saved(500));
    release();
    expect(await reading).toEqual({ state: { velocity: 500 }, version: 0 });
  });

  it('undoes a restore cut short before the page reads, under the exclusive lock', async () => {
    window.localStorage.setItem(KEY, saved(500));
    window.localStorage.setItem(
      JOURNAL,
      JSON.stringify({
        token: '11111111-1111-4111-8111-111111111111',
        phase: 'committing',
        local: [{ key: KEY, before: saved(400), written: saved(500) }],
        photoTools: [],
        maps: false,
      }),
    );
    const { browserStorage, session } = await page();
    expect(await browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
    expect(window.localStorage.getItem(JOURNAL)).toBeNull();
    expect(session.useRecovery.getState().result).toBe('undone');
  });

  it('opens read-only rather than hang when the note of a cut-short restore cannot be read', async () => {
    window.localStorage.setItem(KEY, saved(400));
    window.localStorage.setItem(JOURNAL, '{"phase":"committing"}');
    const { browserStorage, session } = await page();
    expect(await browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
    expect(session.useRecovery.getState().result).toBe('failed');
    expect(window.localStorage.getItem(JOURNAL)).not.toBeNull();
    // What the tool would save now could be taken away by the undo still to come, so it is not saved.
    browserStorage.setItem(KEY, { state: { velocity: 900 }, version: 0 });
    browserStorage.removeItem(KEY);
    expect(window.localStorage.getItem(KEY)).toBe(saved(400));
  });

  it('marks a restore it could not undo, opens read-only, and leaves it to the data page after that', async () => {
    // The value is neither what the restore found nor what it wrote, so the undo cannot tell what to do.
    window.localStorage.setItem(KEY, saved(700));
    window.localStorage.setItem(JOURNAL, JSON.stringify({ ...journal(), phase: 'committing' }));
    let tab = await page();
    await tab.browserStorage.getItem(KEY);
    expect(tab.session.useRecovery.getState().result).toBe('failed');
    expect(JSON.parse(window.localStorage.getItem(JOURNAL)!)).toMatchObject({ failed: true });
    const { createIndexedDb } = await import('@/lib/indexed-db');
    const database = createIndexedDb({ name: 'read-only', version: 1, upgrade: () => undefined });
    await expect(database.run('store', 'readwrite', () => [])).rejects.toMatchObject({ name: 'LabsReadOnlyError' });

    // The next page does not try again: an undo that succeeded later would take away what was saved.
    window.localStorage.setItem(KEY, saved(500));
    const exclusive = vi.spyOn(locks, 'request');
    tab = await page();
    await tab.browserStorage.getItem(KEY);
    expect(tab.session.useRecovery.getState().result).toBe('failed');
    expect(exclusive.mock.calls.some(([, options]) => (options as { mode?: string }).mode === 'exclusive')).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe(saved(500));
  });

  it('opens read-only rather than hang when the settled note cannot be removed', async () => {
    window.localStorage.setItem(KEY, saved(500));
    window.localStorage.setItem(JOURNAL, JSON.stringify({ ...journal(), phase: 'committing' }));
    const remove = Storage.prototype.removeItem;
    const refuse = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === JOURNAL) throw new DOMException('denied', 'SecurityError');
      remove.call(this, key);
    });
    const { browserStorage, session } = await page();
    expect(await browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
    expect(session.useRecovery.getState().result).toBe('failed');
    refuse.mockRestore();
  });

  it('withdraws a shared lock still waited for when the tab moves to the data page', async () => {
    window.localStorage.setItem(KEY, saved(400));
    const release = locks.hold('nilay-labs-open', 'exclusive');
    const { browserStorage, session } = await page();
    void browserStorage.getItem(KEY);
    await settled(Promise.resolve());
    session.enterDataPage();
    release();
    await settled(Promise.resolve());
    // Nothing of this tab holds the lock, so its own restore is not kept out.
    expect(locks.holders('nilay-labs-open')).toEqual([]);
  });

  it('withdraws the wait to settle a cut-short restore when the tab moves to the data page', async () => {
    window.localStorage.setItem(KEY, saved(500));
    window.localStorage.setItem(JOURNAL, JSON.stringify({ ...journal(), phase: 'committing' }));
    // Another tab restores: this page has to wait before it can settle the note.
    const release = locks.hold('nilay-labs-open', 'exclusive');
    const { browserStorage, session } = await page();
    void browserStorage.getItem(KEY);
    await settled(Promise.resolve());
    session.enterDataPage();
    release();
    await settled(Promise.resolve());
    // Neither the exclusive wait nor a shared lock after it is left to this tab.
    expect(locks.holders('nilay-labs-open')).toEqual([]);
    const restore = await locks.request('nilay-labs-open', { mode: 'exclusive', ifAvailable: true }, (lock) => lock);
    expect(restore).not.toBeNull();
  });

  it('keeps the lock for a write under way when the tab moves to the data page, and gives it up once it lands', async () => {
    const { browserStorage, session } = await page();
    await browserStorage.getItem(KEY);
    let land: () => void = () => undefined;
    void session.trackWrite(new Promise<void>((resolve) => (land = resolve)));
    session.enterDataPage();
    await settled(Promise.resolve());
    // The write has not landed: a restore or an export must not start under it.
    expect(locks.holders('nilay-labs-open')).toEqual(['shared']);
    land();
    await session.toolSessionLeft();
    expect(locks.holders('nilay-labs-open')).toEqual([]);
  });

  it('refuses the writes of a tool screen left behind on the data page, but not the data page’s own', async () => {
    const { session } = await page();
    const { createIndexedDb } = await import('@/lib/indexed-db');
    const database = createIndexedDb({
      name: 'left-behind',
      version: 1,
      upgrade: (db) => {
        db.createObjectStore('store');
      },
    });
    session.enterDataPage();
    await expect(database.run('store', 'readwrite', () => [])).rejects.toMatchObject({ name: 'LabsReadOnlyError' });
    await expect(session.asDataPage(() => database.run('store', 'readwrite', () => []))).resolves.toEqual([]);
  });

  it('settles a restore cut short before reading even without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    window.localStorage.setItem(KEY, saved(500));
    window.localStorage.setItem(JOURNAL, JSON.stringify({ ...journal(), phase: 'committing' }));
    const { browserStorage, session } = await page();
    expect(await browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
    expect(session.useRecovery.getState().result).toBe('undone');
  });

  it('lets the data page read at once and gives up a shared lock the same tab held from a tool', async () => {
    window.localStorage.setItem(KEY, saved(400));
    const { browserStorage, session } = await page();
    await browserStorage.getItem(KEY);
    expect(locks.holders('nilay-labs-open')).toEqual(['shared']);
    const leave = session.enterDataPage();
    await settled(Promise.resolve());
    expect(locks.holders('nilay-labs-open')).toEqual([]);
    expect(browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
    // Back on a tool, the tab takes the shared lock again before reading.
    leave();
    await browserStorage.getItem(KEY);
    expect(locks.holders('nilay-labs-open')).toEqual(['shared']);
  });

  it('reads the site language at once, whatever the lock', async () => {
    window.localStorage.setItem('nilay-language-v1', JSON.stringify({ state: { language: 'en' }, version: 0 }));
    locks.hold('nilay-labs-open', 'exclusive');
    const { browserStorage } = await page();
    expect(browserStorage.getItem('nilay-language-v1')).toEqual({ state: { language: 'en' }, version: 0 });
  });

  it('reads at once where the browser has no Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    window.localStorage.setItem(KEY, saved(400));
    const { browserStorage } = await page();
    expect(browserStorage.getItem(KEY)).toEqual({ state: { velocity: 400 }, version: 0 });
  });
});
