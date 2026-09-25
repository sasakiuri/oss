/**
 * Photos attached to records in the Labs tools, kept in this browser's IndexedDB.
 *
 * One database holds the photos of every tool. Each photo names its tool and the record it belongs
 * to, and is listed and deleted by those, so a tool that deletes a record can take its photos with it.
 * What is read back is checked against the schema; a record that no longer matches is deleted and
 * counted, so the screen can say that something could not be read.
 */

import { readStoredText } from '@/lib/browser-storage';
import { createIndexedDb } from '@/lib/indexed-db';
import { labsWritable } from '@/lib/labs-session';
import { PHOTOS_PER_RECORD_MAX, savedPhotoSchema, type SavedPhoto } from '@/lib/schemas/photos';

export const photoDatabaseName = 'nilay-labs-photos-v1';
const storeName = 'photos';
const ownerIndex = 'owner';
const toolIndex = 'tool';

/**
 * How many times the photos of each tool, and of each record, have been deleted, by any tab. Kept as
 * records of the photo store under a tool name no tool has, so no index lists them as photos and the
 * database needs no new version (a tab still open on an older page keeps working).
 */
const deletionTool = '#deletions';
const toolDeletionKey = (tool: string) => `deletions:tool:${tool}`;
const ownerDeletionPrefix = (tool: string) => `deletions:owner:${tool}:`;
const ownerDeletionKey = (tool: string, ownerId: string) => `${ownerDeletionPrefix(tool)}${ownerId}`;

const database = createIndexedDb({
  name: photoDatabaseName,
  version: 1,
  upgrade: (db) => {
    const store = db.createObjectStore(storeName, { keyPath: 'id' });
    store.createIndex(ownerIndex, ['tool', 'ownerId']);
    store.createIndex(toolIndex, 'tool');
  },
});

/** Refused because the record already has `PHOTOS_PER_RECORD_MAX` photos. */
export class PhotoLimitError extends Error {
  constructor() {
    super(`A record holds at most ${PHOTOS_PER_RECORD_MAX} photos`);
    this.name = 'PhotoLimitError';
  }
}

export interface PhotoList {
  photos: SavedPhoto[];
  /** Records that did not match the schema and were deleted. */
  discarded: number;
}

function sortByAdded(photos: SavedPhoto[]): SavedPhoto[] {
  return photos.sort((a, b) => (a.addedAt === b.addedAt ? 0 : a.addedAt < b.addedAt ? -1 : 1));
}

/**
 * Reads what a request returned. Records that no longer match the schema are counted and then deleted,
 * in a write of their own, so the same notice is not raised again; while the tools are read-only
 * (`labs-session.ts`) they are only counted, and the photos can still be shown.
 */
async function readValid(
  select: (store: IDBObjectStore) => IDBRequest<unknown[]>,
): Promise<{ photos: SavedPhoto[]; discarded: number }> {
  const [values] = await database.run(storeName, 'readonly', (transaction) => [
    select(transaction.objectStore(storeName)),
  ]);
  const photos: SavedPhoto[] = [];
  const broken: IDBValidKey[] = [];
  for (const value of (values as unknown[] | undefined) ?? []) {
    const parsed = savedPhotoSchema.safeParse(value);
    if (parsed.success) {
      photos.push(parsed.data);
      continue;
    }
    const id = (value as { id?: unknown } | null)?.id;
    broken.push(typeof id === 'string' || typeof id === 'number' ? id : '');
  }
  const deletable = broken.filter((id) => id !== '');
  if (deletable.length > 0 && labsWritable())
    await database
      .run(storeName, 'readwrite', (transaction) =>
        deletable.map((id) => transaction.objectStore(storeName).delete(id)),
      )
      .catch(() => undefined);
  return { photos: sortByAdded(photos), discarded: broken.length };
}

/** The photos of one record, oldest first. */
export function listPhotos(tool: string, ownerId: string): Promise<PhotoList> {
  return readValid((store) => store.index(ownerIndex).getAll(IDBKeyRange.only([tool, ownerId])));
}

/** Every photo of one tool, for the backup and for putting a tool's photos back after a failed restore. */
export function readToolPhotos(tool: string): Promise<PhotoList> {
  return readValid((store) => store.index(toolIndex).getAll(IDBKeyRange.only(tool)));
}

/** The deletions of a record's photos as they stood when a photo was chosen for it (`photoOwnerTicket`). */
export interface PhotoOwnerTicket {
  tool: string;
  ownerId: string;
  toolDeletions: number;
  ownerDeletions: number;
}

const count = (value: unknown) => {
  const counted = (value as { count?: unknown } | undefined)?.count;
  return typeof counted === 'number' ? counted : 0;
};

/** Adds one to a deletion count, inside the transaction that deletes. */
function countDeletion(store: IDBObjectStore, key: string) {
  const counted = store.get(key);
  counted.onsuccess = () => {
    store.put({ id: key, tool: deletionTool, count: count(counted.result) + 1 });
  };
}

/**
 * Taken as photos are chosen for a record, before they are prepared: the deletions of its photos and
 * its tool's so far, as the database has them. `addPhoto` refuses the photos once either has moved on,
 * whichever tab deleted them.
 *
 * A deletion in another tab can land while this tab is still opening the database, before the counts
 * are read. Every tool removes a record from its saved value (`savedIn`, the localStorage key) before
 * it deletes the record's photos, so once the counts are read the record is looked for there: a record
 * no longer saved was deleted, and its photos are refused.
 */
export async function photoOwnerTicket(tool: string, ownerId: string, savedIn: string): Promise<PhotoOwnerTicket> {
  const [toolDeletions, ownerDeletions] = await database.run(storeName, 'readonly', (transaction) => {
    const store = transaction.objectStore(storeName);
    return [store.get(toolDeletionKey(tool)), store.get(ownerDeletionKey(tool, ownerId))];
  });
  if (!recordSaved(savedIn, ownerId)) throw new PhotoOwnerDeletedError();
  return { tool, ownerId, toolDeletions: count(toolDeletions), ownerDeletions: count(ownerDeletions) };
}

/** Whether the value saved under `savedIn` holds a record whose `id` is `ownerId`, at any depth. */
function recordSaved(savedIn: string, ownerId: string): boolean {
  const saved = readStoredText(savedIn);
  if (saved === null || saved === 'unreadable') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return false;
  }
  const holds = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(holds);
    if (typeof value !== 'object' || value === null) return false;
    if ((value as { id?: unknown }).id === ownerId) return true;
    return Object.values(value).some(holds);
  };
  return holds(parsed);
}

/** Refused because the record's photos were deleted after the photo was chosen for it. */
export class PhotoOwnerDeletedError extends Error {
  constructor() {
    super('The photos of this record were deleted after the photo was chosen');
    this.name = 'PhotoOwnerDeletedError';
  }
}

/**
 * Keeps a photo of a record. `ticket` is taken with `photoOwnerTicket` when the photo is chosen, before
 * it is prepared. The write's transaction reads the deletions of the record's and the tool's photos
 * first and writes nothing if either has moved on since the ticket; a deletion counts itself in the
 * same transaction as it deletes, so any deletion, in this tab or another, either comes first and
 * refuses the photo or comes after the write and removes it. `maxPerRecord` is a tool's own lower limit
 * (a printed sheet with room for fewer); no tool keeps more than `PHOTOS_PER_RECORD_MAX`.
 */
export async function addPhoto(
  photo: SavedPhoto,
  ticket: PhotoOwnerTicket,
  maxPerRecord: number = PHOTOS_PER_RECORD_MAX,
): Promise<void> {
  const checked = savedPhotoSchema.parse(photo);
  if (ticket.tool !== checked.tool || ticket.ownerId !== checked.ownerId)
    throw new Error('The ticket is for another record');
  const limit = Math.min(maxPerRecord, PHOTOS_PER_RECORD_MAX);
  let full = false;
  let deleted = false;
  try {
    await database.run(storeName, 'readwrite', (transaction) => {
      const store = transaction.objectStore(storeName);
      const toolDeletions = store.get(toolDeletionKey(checked.tool));
      const ownerDeletions = store.get(ownerDeletionKey(checked.tool, checked.ownerId));
      // Requests of one transaction are answered in order, so both counts are read by now.
      ownerDeletions.onsuccess = () => {
        if (
          count(toolDeletions.result) !== ticket.toolDeletions ||
          count(ownerDeletions.result) !== ticket.ownerDeletions
        ) {
          deleted = true;
          transaction.abort();
          return;
        }
        // Counted in the same transaction as the write, so two quick additions cannot both slip under the limit.
        const photos = store.index(ownerIndex).count(IDBKeyRange.only([checked.tool, checked.ownerId]));
        photos.onsuccess = () => {
          if (photos.result >= limit) {
            full = true;
            transaction.abort();
          } else store.add(checked);
        };
      };
    });
  } catch (error) {
    if (deleted) throw new PhotoOwnerDeletedError();
    if (full) throw new PhotoLimitError();
    throw error;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  await database.run(storeName, 'readwrite', (transaction) => [transaction.objectStore(storeName).delete(id)]);
}

/** Deletes the photos under `index`, counting the deletion in the same transaction. */
function deleteByIndex(index: string, key: IDBValidKey, counted: (store: IDBObjectStore) => void): Promise<unknown> {
  return database.run(storeName, 'readwrite', (transaction) => {
    const store = transaction.objectStore(storeName);
    counted(store);
    const keys = store.index(index).getAllKeys(IDBKeyRange.only(key));
    keys.onsuccess = () => {
      for (const id of keys.result) store.delete(id);
    };
  });
}

/**
 * A count of every deletion of a tool's photos. Its records' own counts are dropped with it: every
 * ticket taken before now is refused by the tool's count, so they are no longer needed, and a tool
 * that keeps deleting records does not pile them up.
 */
function countToolDeletion(store: IDBObjectStore, tool: string) {
  countDeletion(store, toolDeletionKey(tool));
  const prefix = ownerDeletionPrefix(tool);
  store.delete(prefixRange(prefix));
}

/** Deletes the photos of one record, for a tool deleting that record. */
export async function deletePhotosOf(tool: string, ownerId: string): Promise<void> {
  await deleteByIndex(ownerIndex, [tool, ownerId], (store) => countDeletion(store, ownerDeletionKey(tool, ownerId)));
}

/** Deletes every photo of one tool, for a tool clearing all it has saved. */
export async function deleteToolPhotos(tool: string): Promise<void> {
  await deleteByIndex(toolIndex, tool, (store) => countToolDeletion(store, tool));
}

/** The ids of a tool's photos, for reading them one at a time (the backup). */
export async function readToolPhotoIds(tool: string): Promise<string[]> {
  const [keys] = await database.run(storeName, 'readonly', (transaction) => [
    transaction.objectStore(storeName).index(toolIndex).getAllKeys(IDBKeyRange.only(tool)),
  ]);
  return ((keys as IDBValidKey[] | undefined) ?? []).filter((key): key is string => typeof key === 'string');
}

/** One photo record as stored, unchecked: the backup checks it and counts what it leaves out. */
export async function readPhotoRaw(id: string): Promise<unknown> {
  const [value] = await database.run(storeName, 'readonly', (transaction) => [
    transaction.objectStore(storeName).get(id),
  ]);
  return value;
}

/*
 * Restoring a backup, in steps that never hold every photo in memory and never leave a tool with a mix.
 *
 * `stagePhoto` writes each photo from the file under a key of the restore (`restore:<token>:<id>`),
 * which no tool reads. `commitStagedPhotos` then swaps, in one transaction, the tool's photos for the
 * staged ones, keeping the replaced photos under keys of their own (`trash:<token>:<id>`), exactly as
 * they were stored. `undoCommittedPhotos` swaps them back; `discardPhotoRestore` deletes whatever a
 * restore left, staged or kept. A marker written with the swap says it happened, so an undo after a
 * restore that stopped before the swap changes nothing.
 */

/** Refused because a photo's id is already taken by a photo of another tool. */
export class PhotoIdConflictError extends Error {
  constructor(id: string) {
    super(`Photo ${id} belongs to another tool`);
    this.name = 'PhotoIdConflictError';
  }
}

const stagedKey = (token: string, id: string) => `restore:${token}:${id}`;
const trashKey = (token: string, id: string) => `trash:${token}:${id}`;
const stagedTool = (token: string, tool: string) => `restore:${token}:${tool}`;
const trashTool = (token: string, tool: string) => `trash:${token}:${tool}`;
const markerKey = (token: string, tool: string) => `trash:${token}:#swapped:${tool}`;
const prefixRange = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`);

/** Ids a restore uses for its own records, and the deletion counts; no photo from a file may take one. */
export function isRestoreKey(id: string): boolean {
  return id.startsWith('restore:') || id.startsWith('trash:') || id.startsWith('deletions:');
}

export async function stagePhoto(token: string, photo: SavedPhoto): Promise<void> {
  const checked = savedPhotoSchema.parse(photo);
  if (isRestoreKey(checked.id)) throw new Error(`Photo id ${checked.id} is reserved`);
  await database.run(storeName, 'readwrite', (transaction) => [
    transaction.objectStore(storeName).put({
      ...checked,
      id: stagedKey(token, checked.id),
      tool: stagedTool(token, checked.tool),
      restoreId: checked.id,
      restoreTool: checked.tool,
    }),
  ]);
}

/** Moves every record a cursor walks to another key, one record at a time, then calls `then`. */
function moveAll(
  store: IDBObjectStore,
  source: IDBRequest<IDBCursorWithValue | null>,
  move: (value: Record<string, unknown>) => Record<string, unknown>,
  then: () => void,
) {
  source.onsuccess = () => {
    const cursor = source.result;
    if (!cursor) {
      then();
      return;
    }
    store.put(move(cursor.value as Record<string, unknown>));
    cursor.delete();
    cursor.continue();
  };
}

const unstage = ({ restoreId, restoreTool, ...value }: Record<string, unknown>) => ({
  ...value,
  id: restoreId,
  tool: restoreTool,
});

/**
 * Swaps a tool's photos for the ones staged, in one transaction. Refused, changing nothing, when a staged
 * photo's id is taken by another tool's photo.
 */
export async function commitStagedPhotos(token: string, tool: string): Promise<void> {
  let conflict: string | null = null;
  try {
    await database.run(storeName, 'readwrite', (transaction) => {
      const store = transaction.objectStore(storeName);
      const index = store.index(toolIndex);
      const liveKeys = index.getAllKeys(IDBKeyRange.only(tool));
      const stagedKeys = index.getAllKeys(IDBKeyRange.only(stagedTool(token, tool)));
      stagedKeys.onsuccess = () => {
        const live = new Set(liveKeys.result);
        const ids = stagedKeys.result.map((key) => String(key).slice(stagedKey(token, '').length));
        const swap = () => {
          store.put({ id: markerKey(token, tool), tool: `trash-marker:${token}` });
          // A photo chosen before the swap belongs to a record the restore replaced, so it is refused.
          countToolDeletion(store, tool);
          moveAll(
            store,
            index.openCursor(IDBKeyRange.only(tool)),
            (value) => ({
              ...value,
              id: trashKey(token, String(value.id)),
              tool: trashTool(token, tool),
              restoreId: value.id,
              restoreTool: tool,
            }),
            () => moveAll(store, index.openCursor(IDBKeyRange.only(stagedTool(token, tool))), unstage, () => undefined),
          );
        };
        let pending = 0;
        for (const id of ids) {
          if (live.has(id)) continue;
          pending += 1;
          const existing = store.getKey(id);
          existing.onsuccess = () => {
            pending -= 1;
            if (conflict !== null) return;
            if (existing.result !== undefined) {
              conflict = id;
              transaction.abort();
              return;
            }
            if (pending === 0) swap();
          };
        }
        if (pending === 0) swap();
      };
    });
  } catch (error) {
    if (conflict !== null) throw new PhotoIdConflictError(conflict);
    throw error;
  }
}

/** Puts back the photos a swap replaced, as they were stored. Does nothing if the swap did not happen. */
export async function undoCommittedPhotos(token: string, tool: string): Promise<void> {
  await database.run(storeName, 'readwrite', (transaction) => {
    const store = transaction.objectStore(storeName);
    const index = store.index(toolIndex);
    const marker = store.getKey(markerKey(token, tool));
    marker.onsuccess = () => {
      if (marker.result === undefined) return;
      countToolDeletion(store, tool);
      const keys = index.getAllKeys(IDBKeyRange.only(tool));
      keys.onsuccess = () => {
        for (const id of keys.result) store.delete(id);
        moveAll(store, index.openCursor(IDBKeyRange.only(trashTool(token, tool))), unstage, () =>
          store.delete(markerKey(token, tool)),
        );
      };
    };
  });
}

/** Deletes whatever a restore left: photos staged and not swapped in, and the photos a swap replaced. */
export async function discardPhotoRestore(token: string): Promise<void> {
  await database.run(storeName, 'readwrite', (transaction) => {
    const store = transaction.objectStore(storeName);
    store.delete(prefixRange(`restore:${token}:`));
    store.delete(prefixRange(`trash:${token}:`));
  });
}
