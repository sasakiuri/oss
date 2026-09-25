import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedPhoto } from '@/lib/schemas/photos';

import { fakeIndexedDb, installFakeIndexedDb } from '../support/fake-indexeddb';

installFakeIndexedDb();

// Imported after the fake is installed, so the module opens the fake database.
let storage: typeof import('@/lib/photo-storage');
beforeAll(async () => {
  storage = await import('@/lib/photo-storage');
});

const photo = (id: string, overrides: Partial<SavedPhoto> = {}): SavedPhoto => ({
  id,
  tool: 'hunting-log',
  ownerId: 'outing-1',
  type: 'image/jpeg',
  data: new Uint8Array([1, 2, 3]).buffer,
  width: 4,
  height: 3,
  addedAt: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

/** Where a tool would have saved its records: every record the tests attach photos to. */
const savedIn = 'test-saved-records';

/** Keeps a photo chosen now, as a tool does. */
const add = async (value: SavedPhoto) =>
  storage.addPhoto(value, await storage.photoOwnerTicket(value.tool, value.ownerId, savedIn));
const ids = async (tool: string) => (await storage.readToolPhotoIds(tool)).sort();
/** The keys of the stored photos and restore records, leaving out the deletion counts kept beside them. */
const allKeys = () =>
  [...fakeIndexedDb.databases.get('nilay-labs-photos-v1')!.stores.get('photos')!.records.keys()].filter(
    (key) => !key.includes('deletions:'),
  );

describe('photo storage', () => {
  beforeEach(() => {
    for (const record of fakeIndexedDb.databases.get('nilay-labs-photos-v1')?.stores.get('photos')?.records.keys() ??
      [])
      fakeIndexedDb.databases.get('nilay-labs-photos-v1')!.stores.get('photos')!.records.delete(record);
    fakeIndexedDb.failWrites = 0;
    window.localStorage.setItem(
      savedIn,
      JSON.stringify({ state: { records: [{ id: 'outing-1' }, { id: 'outing-2' }] } }),
    );
  });

  it('adds, lists by record and refuses an eleventh photo on one record', async () => {
    for (let index = 0; index < 10; index += 1) await add(photo(`p${index}`));
    await expect(add(photo('p10'))).rejects.toBeInstanceOf(storage.PhotoLimitError);
    expect((await storage.listPhotos('hunting-log', 'outing-1')).photos).toHaveLength(10);
    expect((await storage.listPhotos('hunting-log', 'other')).photos).toHaveLength(0);
  });

  it('reads one photo at a time for the backup, without checking or deleting', async () => {
    await add(photo('a'));
    expect(await ids('hunting-log')).toEqual(['a']);
    expect(await storage.readPhotoRaw('a')).toMatchObject({ id: 'a', tool: 'hunting-log' });
    expect(await storage.readPhotoRaw('missing')).toBeUndefined();
  });

  it('swaps a tool’s photos for staged ones, keeps the replaced ones, and swaps them back on undo', async () => {
    await add(photo('old'));
    await add(photo('other-tool', { tool: 'trap-check-log' }));
    await storage.stagePhoto('t1', photo('new'));
    // Staged photos are invisible to the tool until the swap.
    expect(await ids('hunting-log')).toEqual(['old']);

    await storage.commitStagedPhotos('t1', 'hunting-log');
    expect(await ids('hunting-log')).toEqual(['new']);
    expect(await ids('trap-check-log')).toEqual(['other-tool']);
    expect(allKeys().some((key) => key.includes('trash:t1:old'))).toBe(true);

    await storage.undoCommittedPhotos('t1', 'hunting-log');
    expect(await ids('hunting-log')).toEqual(['old']);
    expect(await storage.readPhotoRaw('old')).toEqual(photo('old'));
    await storage.discardPhotoRestore('t1');
    expect(allKeys().sort()).toEqual(['"old"', '"other-tool"']);
  });

  it('restores the same photos onto the device that has them, keeping every id', async () => {
    await add(photo('same'));
    await storage.stagePhoto('t2', photo('same', { ownerId: 'outing-2' }));
    await storage.commitStagedPhotos('t2', 'hunting-log');
    expect(await storage.readPhotoRaw('same')).toMatchObject({ ownerId: 'outing-2' });
    await storage.discardPhotoRestore('t2');
    expect(allKeys()).toEqual(['"same"']);
  });

  it('changes nothing on undo when the swap never happened', async () => {
    await add(photo('kept'));
    await storage.stagePhoto('t3', photo('staged'));
    await storage.undoCommittedPhotos('t3', 'hunting-log');
    expect(await ids('hunting-log')).toEqual(['kept']);
    await storage.discardPhotoRestore('t3');
    expect(allKeys()).toEqual(['"kept"']);
  });

  it('refuses a swap whose photo id another tool already has, changing nothing', async () => {
    await add(photo('taken', { tool: 'trap-check-log' }));
    await add(photo('mine'));
    await storage.stagePhoto('t4', photo('taken'));
    await expect(storage.commitStagedPhotos('t4', 'hunting-log')).rejects.toBeInstanceOf(storage.PhotoIdConflictError);
    expect(await ids('hunting-log')).toEqual(['mine']);
    expect(await ids('trap-check-log')).toEqual(['taken']);
  });

  it('leaves the photos as they were when the disk fills during the swap', async () => {
    await add(photo('before'));
    await storage.stagePhoto('t5', photo('after'));
    fakeIndexedDb.failWrites = 2;
    await expect(storage.commitStagedPhotos('t5', 'hunting-log')).rejects.toThrow();
    expect(await ids('hunting-log')).toEqual(['before']);
  });

  it('refuses to stage a photo whose id a restore reserves', async () => {
    await expect(storage.stagePhoto('t6', photo('restore:x:y'))).rejects.toThrow('reserved');
  });
  it('refuses a photo chosen before its record or its tool had its photos deleted', async () => {
    const ofRecord = await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn);
    await storage.deletePhotosOf('hunting-log', 'outing-1');
    await expect(storage.addPhoto(photo('late-1'), ofRecord)).rejects.toBeInstanceOf(storage.PhotoOwnerDeletedError);
    const ofTool = await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn);
    await storage.deleteToolPhotos('hunting-log');
    await expect(storage.addPhoto(photo('late-2'), ofTool)).rejects.toBeInstanceOf(storage.PhotoOwnerDeletedError);
    expect(allKeys()).toEqual([]);
  });

  it('keeps a photo chosen for a record when only another record or tool had its photos deleted', async () => {
    const ticket = await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn);
    await storage.deletePhotosOf('hunting-log', 'outing-2');
    await storage.deleteToolPhotos('trap-check-log');
    await storage.addPhoto(photo('kept'), ticket);
    expect(await ids('hunting-log')).toEqual(['kept']);
  });

  it('removes a photo whose write started before the deletion was asked for', async () => {
    const ticket = await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn);
    const adding = storage.addPhoto(photo('racing'), ticket);
    const deleting = storage.deleteToolPhotos('hunting-log');
    await Promise.allSettled([adding, deleting]);
    expect(allKeys()).toEqual([]);
  });
  it('refuses a photo for a record no longer saved when its ticket is read', async () => {
    // Another tab removed the record, then deleted its photos, before this tab read the counts.
    window.localStorage.setItem(
      savedIn,
      JSON.stringify({ state: { records: [{ id: 'outing-2', note: 'outing-1' }] } }),
    );
    await expect(storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn)).rejects.toBeInstanceOf(
      storage.PhotoOwnerDeletedError,
    );
  });

  it('refuses a photo chosen before a restore replaced its tool’s photos', async () => {
    const ticket = await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn);
    await storage.stagePhoto('r1', photo('restored'));
    await storage.commitStagedPhotos('r1', 'hunting-log');
    await expect(storage.addPhoto(photo('late'), ticket)).rejects.toBeInstanceOf(storage.PhotoOwnerDeletedError);
  });

  it('refuses a photo once another tab deleted its record’s or its tool’s photos', async () => {
    const ofRecord = await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn);
    const ofTool = await storage.photoOwnerTicket('hunting-log', 'outing-2', savedIn);
    // Another tab: the same database through a connection and a module of its own.
    vi.resetModules();
    const other = await import('@/lib/photo-storage');
    await other.deletePhotosOf('hunting-log', 'outing-1');
    await other.deleteToolPhotos('hunting-log');
    await expect(storage.addPhoto(photo('late-1'), ofRecord)).rejects.toBeInstanceOf(storage.PhotoOwnerDeletedError);
    await expect(storage.addPhoto(photo('late-2', { ownerId: 'outing-2' }), ofTool)).rejects.toBeInstanceOf(
      storage.PhotoOwnerDeletedError,
    );
    expect(allKeys()).toEqual([]);
    // A photo chosen after the deletion is kept.
    await storage.addPhoto(photo('after'), await storage.photoOwnerTicket('hunting-log', 'outing-1', savedIn));
    expect(await ids('hunting-log')).toEqual(['after']);
  });
});
