import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialRecoilSettings, storageKey as recoilKey } from '@/app/(standalone)/labs/recoil/_store';
import { useStorageStatus } from '@/lib/browser-storage';
import { RESTORE_JOURNAL_KEY } from '@/lib/labs-restore-journal';
import { asDataPage, enterDataPage } from '@/lib/labs-session';
import { createGibierRecord } from '@/lib/schemas/gibier-record';
import type { HunterMapSetup, SavedMapImage } from '@/lib/schemas/hunter-map';
import type { SavedPhoto } from '@/lib/schemas/photos';
import { useLanguageStore } from '@/store';

import { fakeIndexedDb, installFakeIndexedDb } from '../support/fake-indexeddb';
import { installFakeLocks, type FakeLockManager } from '../support/fake-locks';

// The databases run in memory, as the storage modules wrote them; the E2E spec runs a real browser.
installFakeIndexedDb();

vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title }: { title: string }) => createElement('header', null, title),
    LanguageMenu: () => null,
  };
});

// jsdom draws no pictures; every picture here is taken to be the size it says, except one byte long.
vi.mock('@/lib/hunter-map-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hunter-map-storage')>()),
  readImageSize: vi.fn(async (blob: Blob) =>
    blob.size === 1 ? null : blob.type === 'image/png' ? { width: 8, height: 6 } : { width: 4, height: 3 },
  ),
}));

const download = vi.hoisted(() => ({ blob: null as Blob | null, name: '' }));
vi.mock('@/lib/download', () => ({
  downloadBlob: vi.fn((blob: Blob, name: string) => {
    download.blob = blob;
    download.name = name;
  }),
}));

// Spied on by the size test.
vi.mock('@/lib/labs-backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/labs-backup')>()),
}));

let backup: typeof import('@/app/(standalone)/labs/data/backup');
let maps: typeof import('@/lib/hunter-map-storage');
let photos: typeof import('@/lib/photo-storage');
let LabsDataClient: typeof import('@/app/(standalone)/labs/data/data-client').LabsDataClient;
beforeAll(async () => {
  backup = await import('@/app/(standalone)/labs/data/backup');
  maps = await import('@/lib/hunter-map-storage');
  photos = await import('@/lib/photo-storage');
  LabsDataClient = (await import('@/app/(standalone)/labs/data/data-client')).LabsDataClient;
  // The data page imports every tool's store, which takes a while when the whole suite runs at once.
}, 60_000);

// jsdom's Blob has no text(), which every browser has; read it the way jsdom can.
if (!Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

const recoilSave = (velocity: number) => ({
  state: { settings: { ...initialRecoilSettings, a: { ...initialRecoilSettings.a, velocity } } },
  version: 0,
});
const logKey = 'nilay-labs-hunting-log-v1';
const outing = (id: string) => ({
  id,
  date: '2025-11-20',
  prefecture: '長野県',
  municipality: '',
  mesh: '12',
  license: 'trap',
  catches: [],
  note: '',
});
const logSave = (...ids: string[]) => ({
  state: { outings: ids.map(outing), prefecture: null, registrationDates: {} },
  version: 0,
});
const photo = (id: string, ownerId: string, byte = 7): SavedPhoto => ({
  id,
  tool: 'hunting-log',
  ownerId,
  type: 'image/jpeg',
  data: new Uint8Array([byte, byte, byte]).buffer,
  width: 4,
  height: 3,
  addedAt: '2026-09-24T00:00:00.000Z',
});
const mapImage = (id: string, byte = 1): SavedMapImage => ({
  id,
  data: new Uint8Array([byte, byte]).buffer,
  type: 'image/png',
  name: `${id}.png`,
  width: 8,
  height: 6,
});
const mapSetup = (id: string): HunterMapSetup => ({
  id,
  name: id,
  fiscalYear: null,
  points: [],
  model: 'affine',
  projection: 'transverse-mercator',
  zones: [],
});

/** The device's data, in the form a test compares before and after. */
async function device() {
  const mapIds = (await maps.readMapIds()).sort();
  return {
    recoil: window.localStorage.getItem(recoilKey),
    log: window.localStorage.getItem(logKey),
    maps: mapIds,
    active: (await maps.readCatalog()).activeId,
    photos: (await photos.readToolPhotoIds('hunting-log')).sort(),
  };
}

async function exportFile(): Promise<File> {
  const collected = await backup.collectBackup(new Date('2026-09-24T00:00:00Z'));
  if (collected.state !== 'ready') throw new Error(collected.state);
  return new File([collected.blob], 'backup.jsonl');
}

async function seed() {
  window.localStorage.setItem(recoilKey, JSON.stringify(recoilSave(400)));
  window.localStorage.setItem(logKey, JSON.stringify(logSave('outing-1')));
  await setUp(() => maps.writeNewMap('map-a', mapImage('map-a'), mapSetup('map-a')));
  await setUp(() => maps.writeNewMap('map-b', mapImage('map-b'), mapSetup('map-b')));
  await setUp(async () =>
    photos.addPhoto(photo('p1', 'outing-1'), await photos.photoOwnerTicket('hunting-log', 'outing-1', logKey)),
  );
}

async function wipe() {
  window.localStorage.clear();
  await setUp(() => maps.clearSavedMaps());
  for (const tool of ['hunting-log', 'gibier-record'])
    for (const id of await photos.readToolPhotoIds(tool)) await setUp(() => photos.deletePhoto(id));
}

/**
 * The device's data as a test sets it up, written as the tools would have. These tests act as the data
 * page, which lets only its own restore write, so the setting up is let through the same way.
 */
const setUp = <T,>(work: () => Promise<T>) => asDataPage(work);

const settled = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const chooseFile = (file: File) =>
  fireEvent.change(screen.getByLabelText('書き出したバックアップファイル'), { target: { files: [file] } });

let locks: FakeLockManager;

beforeEach(async () => {
  useStorageStatus.setState({ available: true, discarded: [] });
  useLanguageStore.setState({ language: 'ja' });
  fakeIndexedDb.failWrites = 0;
  download.blob = null;
  locks = installFakeLocks();
  // These tests act as the data page, which restores and so holds none of the lock the tools hold.
  enterDataPage();
  await wipe();
});

afterEach(() => vi.restoreAllMocks());

describe('export and restore', () => {
  it('carries the photos of the capture records with the records', async () => {
    const recordKey = 'nilay-labs-gibier-record-v1';
    const capture = createGibierRecord('capture-1', '2026-09-24T00:00:00.000Z');
    window.localStorage.setItem(
      recordKey,
      JSON.stringify({ state: { records: [capture], currentId: 'capture-1' }, version: 0 }),
    );
    await setUp(async () =>
      photos.addPhoto(
        { ...photo('g1', 'capture-1'), tool: 'gibier-record' },
        await photos.photoOwnerTicket('gibier-record', 'capture-1', recordKey),
      ),
    );
    const file = await exportFile();
    await wipe();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);
    expect(planned.plan.photos).toEqual([{ tool: 'gibier-record', count: 1 }]);
    expect(await backup.applyRestore(file, planned.plan)).toMatchObject({ state: 'restored' });
    expect(await photos.readToolPhotoIds('gibier-record')).toEqual(['g1']);
  });

  it('carries every tool, every map with the open one, and the photos to an empty device', async () => {
    await seed();
    // A photo left from a record deleted before tools took their photos with them.
    window.localStorage.setItem('test-orphan-owner', JSON.stringify([{ id: 'deleted-outing' }]));
    await setUp(async () =>
      photos.addPhoto(
        photo('orphan', 'deleted-outing'),
        await photos.photoOwnerTicket('hunting-log', 'deleted-outing', 'test-orphan-owner'),
      ),
    );
    window.localStorage.removeItem('test-orphan-owner');
    const collected = await backup.collectBackup(new Date(0));
    if (collected.state !== 'ready') throw new Error(collected.state);
    expect(collected.summary).toMatchObject({ maps: 2, mapsLeftOut: 0, photos: 1, photosLeftOut: 1 });
    const before = await device();
    const file = new File([collected.blob], 'backup.jsonl');

    await wipe();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);
    expect(planned.plan.rejected).toEqual([]);
    expect(await backup.applyRestore(file, planned.plan)).toMatchObject({ state: 'restored' });

    expect(await device()).toEqual({ ...before, photos: ['p1'] });
    expect(await maps.readMapRaw('map-b')).toEqual({ setup: mapSetup('map-b'), image: mapImage('map-b') });
    expect(await photos.readPhotoRaw('p1')).toEqual(photo('p1', 'outing-1'));
    // Nothing of the restore is left behind, and the other tabs were told it changed their data.
    // Deletion counts are kept beside the photos (a restore counts as one); nothing else is left.
    expect(
      [...fakeIndexedDb.databases.get('nilay-labs-photos-v1')!.stores.get('photos')!.records.keys()].filter(
        (key) => !key.includes('deletions:'),
      ),
    ).toEqual(['"p1"']);
    expect(window.localStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it('puts every part back when a write fails partway, including maps the current schema cannot read', async () => {
    await seed();
    const file = await exportFile();
    // The device now has other data: a different recoil, one map the tool can no longer read, no photos.
    await wipe();
    window.localStorage.setItem(recoilKey, JSON.stringify(recoilSave(700)));
    await setUp(() => maps.writeNewMap('map-old', mapImage('map-old'), { id: 'map-old', from: 'an older version' }));
    const before = await device();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);

    // Staging passes; the disk fills while the maps are swapped in, after the photos have been.
    const commit = maps.commitStagedMaps;
    vi.spyOn(maps, 'commitStagedMaps').mockImplementation(async (token) => {
      fakeIndexedDb.failWrites = 1;
      return commit(token);
    });
    const result = await backup.applyRestore(file, planned.plan);
    expect(result).toEqual({ state: 'rolled-back', failed: { kind: 'hunter-map' } });
    expect(await device()).toEqual(before);
    expect((await maps.readMapRaw('map-old')).setup).toEqual({ id: 'map-old', from: 'an older version' });
    expect(window.localStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it('undoes a restore cut short the next time the page opens', async () => {
    await seed();
    const file = await exportFile();
    await wipe();
    window.localStorage.setItem(recoilKey, JSON.stringify(recoilSave(700)));
    const before = await device();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);

    // The tab closes while the maps are being swapped in: the swap never finishes, nothing tidies up.
    vi.spyOn(maps, 'commitStagedMaps').mockImplementation(() => new Promise(() => undefined));
    void backup.applyRestore(file, planned.plan);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(RESTORE_JOURNAL_KEY)!).phase).toBe('committing'));
    await waitFor(async () => expect((await device()).photos).toEqual(['p1']));
    // The closed tab's lock is gone with it.
    locks = installFakeLocks();
    vi.mocked(maps.commitStagedMaps).mockRestore();

    expect(await backup.recoverInterruptedRestore()).toBe('undone');
    expect(await device()).toEqual(before);
    expect(window.localStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it('does not call a restore done when the note that it is done cannot be saved, and puts everything back', async () => {
    await seed();
    const file = await exportFile();
    await wipe();
    window.localStorage.setItem(recoilKey, JSON.stringify(recoilSave(700)));
    const before = await device();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);
    // Every part is swapped in; then localStorage refuses the note that says so.
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === RESTORE_JOURNAL_KEY && value.includes('"phase":"cleanup"'))
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    const result = await backup.applyRestore(file, planned.plan);
    expect(result).toEqual({ state: 'rolled-back', failed: { kind: 'hunter-map' } });
    expect(await device()).toEqual(before);
    expect(window.localStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it('carries a map picture larger than one line, chunk by chunk, and restores it byte for byte', async () => {
    const picture = { ...mapImage('map-big'), data: new Uint8Array(1024 * 1024 + 300).map((_, i) => i % 199).buffer };
    await setUp(() => maps.writeNewMap('map-big', picture, mapSetup('map-big')));
    const file = await exportFile();
    await wipe();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);
    expect(await backup.applyRestore(file, planned.plan)).toMatchObject({ state: 'restored' });
    const restored = (await maps.readMapRaw('map-big')).image as { data: ArrayBuffer };
    expect(new Uint8Array(restored.data)).toEqual(new Uint8Array(picture.data));
  }, 30_000);

  it('writes nothing when what is on the device cannot be read, while another Labs page is open, or without Web Locks', async () => {
    await seed();
    const file = await exportFile();
    const planned = await backup.planRestore(file);
    if (!planned.ok) throw new Error(planned.error);

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(await backup.applyRestore(file, planned.plan)).toEqual({ state: 'not-started', reason: 'unreadable' });
    getItem.mockRestore();

    // Another tab has a tool open: it holds the shared lock every Labs page takes before reading.
    const release = locks.hold('nilay-labs-open', 'shared');
    await waitFor(() => expect(locks.holders('nilay-labs-open')).toEqual(['shared']));
    const recoil = window.localStorage.getItem(recoilKey);
    expect(await backup.applyRestore(file, planned.plan)).toEqual({ state: 'not-started', reason: 'other-tabs' });
    expect(window.localStorage.getItem(recoilKey)).toBe(recoil);
    release();

    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    expect(await backup.applyRestore(file, planned.plan)).toEqual({ state: 'not-started', reason: 'unsupported' });
  });

  it('leaves the device’s maps alone when the export could not read them, and says so', async () => {
    await seed();
    // The device's only map can no longer be read: the file says “not included” rather than “no maps”.
    await setUp(() => maps.clearSavedMaps());
    await setUp(() => maps.writeNewMap('map-x', mapImage('map-x', 9), { id: 'map-x', broken: true }));
    const collected = await backup.collectBackup(new Date(0));
    if (collected.state !== 'ready') throw new Error(collected.state);
    expect(collected.summary.mapsLeftOut).toBe(1);
    const planned = await backup.planRestore(new File([collected.blob], 'backup.jsonl'));
    expect(planned.ok && planned.plan.notIncluded).toEqual(['hunter-map']);
    expect(planned.ok && planned.plan.hunterMap).toBeNull();
  });

  it('refuses to make a file larger than it could read back, before making any of it', async () => {
    await seed();
    const labs = await import('@/lib/labs-backup');
    vi.spyOn(labs, 'estimatePhotoBytes').mockReturnValue(300 * 1024 * 1024);
    const line = vi.spyOn(labs, 'photoLine');
    expect(await backup.collectBackup(new Date(0))).toMatchObject({ state: 'too-large' });
    expect(line).not.toHaveBeenCalled();
  });
});

describe('exporting beside a restore', () => {
  it('waits for a restore running in another tab rather than export a device half restored', async () => {
    await seed();
    // Another data page restores: it holds the Labs lock exclusively.
    const release = locks.hold('nilay-labs-open', 'exclusive');
    await waitFor(() => expect(locks.holders('nilay-labs-open')).toEqual(['exclusive']));
    let done = false;
    const exporting = backup.collectBackup(new Date(0)).then((result) => {
      done = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(done).toBe(false);
    release();
    expect(await exporting).toMatchObject({ state: 'ready' });
  });

  it('does not export while a restore cut short is unsettled', async () => {
    await seed();
    window.localStorage.setItem(
      RESTORE_JOURNAL_KEY,
      JSON.stringify({
        token: '11111111-1111-4111-8111-111111111111',
        phase: 'committing',
        local: [],
        photoTools: [],
        maps: false,
        failed: true,
      }),
    );
    expect(await backup.collectBackup(new Date(0))).toEqual({ state: 'interrupted' });
  });

  it('leaves a restore it could not undo to the reader: try again, or delete its note', async () => {
    await seed();
    const recoil = window.localStorage.getItem(recoilKey);
    window.localStorage.setItem(
      RESTORE_JOURNAL_KEY,
      JSON.stringify({
        token: '11111111-1111-4111-8111-111111111111',
        phase: 'committing',
        // Neither what the restore found nor what it wrote: the undo cannot tell what to do.
        local: [{ key: recoilKey, before: 'x', written: 'y' }],
        photoTools: [],
        maps: false,
        failed: true,
      }),
    );
    // Not tried again on its own when the page opens.
    expect(await backup.recoverInterruptedRestore()).toBe('failed');
    expect(await backup.retryInterruptedRestore()).toBe('failed');
    // Not while another Labs page is open.
    const release = locks.hold('nilay-labs-open', 'shared');
    await waitFor(() => expect(locks.holders('nilay-labs-open')).toEqual(['shared']));
    expect(await backup.abandonInterruptedRestore()).toBe('waiting');
    release();
    await waitFor(() => expect(locks.holders('nilay-labs-open')).toEqual([]));
    expect(await backup.abandonInterruptedRestore()).toBe('none');
    expect(window.localStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
    expect(window.localStorage.getItem(recoilKey)).toBe(recoil);
  });
});

describe('the Labs data page', () => {
  it('exports and names what a tool could not read', async () => {
    window.localStorage.setItem(recoilKey, JSON.stringify(recoilSave(400)));
    window.localStorage.setItem(
      'nilay-labs-trajectory-v1',
      JSON.stringify({ state: { settings: 'broken' }, version: 0 }),
    );
    render(<LabsDataClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'ファイルに書き出す' }));
    expect(await screen.findByText('1 件のツールのデータを書き出しました。')).toBeInTheDocument();
    expect(screen.getByText('弾道計算とゼロイン')).toBeInTheDocument();
    expect(download.name).toMatch(/^nilay-labs-backup-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const header = JSON.parse((await download.blob!.text()).split('\n')[0]!) as Record<string, unknown>;
    expect(header).toMatchObject({ localStorage: { [recoilKey]: recoilSave(400) }, hunterMap: { status: 'empty' } });
  });

  it('shows what a file would restore and what it would not, and writes only after confirming', async () => {
    await seed();
    const file = await exportFile();
    await wipe();
    render(<LabsDataClient />);
    await settled();
    chooseFile(file);
    expect(await screen.findByText('次のデータを読み込みます。')).toBeInTheDocument();
    expect(screen.getByText(/狩猟マップ（地図 2 枚）/)).toBeInTheDocument();
    expect(screen.getByText(/の写真（1 枚）/)).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    expect(window.localStorage.getItem(recoilKey)).toBeNull();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    expect(await screen.findByText(/件のデータを読み込みました。/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(recoilKey)!)).toEqual(recoilSave(400));
  });

  it('refuses a file that is not a Labs backup, and one larger than the page reads', async () => {
    render(<LabsDataClient />);
    await settled();
    chooseFile(new File(['not json'], 'x.jsonl'));
    expect(await screen.findByText('Labs のバックアップファイルではありません。')).toBeInTheDocument();
    chooseFile(new File(['{"format":"something-else"}'], 'x.jsonl'));
    expect(await screen.findByText(/Labs で書き出したファイルではないか/)).toBeInTheDocument();
    const huge = new File(['{}'], 'huge.jsonl');
    Object.defineProperty(huge, 'size', { value: 257 * 1024 * 1024 });
    chooseFile(huge);
    expect(await screen.findByText(/ファイルが大きすぎます/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '読み込む' })).not.toBeInTheDocument();
  });

  it('shows the plan of the file chosen last, even when an earlier one finishes checking later', async () => {
    await seed();
    const file = await exportFile();
    render(<LabsDataClient />);
    await settled();
    let release: () => void = () => undefined;
    const slow = new File(['x'], 'slow.jsonl');
    const gate = new Promise<void>((resolve) => (release = resolve));
    Object.defineProperty(slow, 'slice', {
      value: () => ({ arrayBuffer: () => gate.then(() => new TextEncoder().encode('not json').buffer) }),
    });
    chooseFile(slow);
    chooseFile(file);
    expect(await screen.findByText('次のデータを読み込みます。')).toBeInTheDocument();
    await act(async () => release());
    expect(screen.getByText('次のデータを読み込みます。')).toBeInTheDocument();
    expect(screen.queryByText('Labs のバックアップファイルではありません。')).not.toBeInTheDocument();
  });
});
