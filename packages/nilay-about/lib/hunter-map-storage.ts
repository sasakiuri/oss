/**
 * The map pictures and their setups, kept in this browser's IndexedDB.
 *
 * A map picture runs to megabytes, beyond what localStorage holds, so its bytes are stored here.
 * Each map is two records under one id: the picture, written once when it is added, and its setup
 * (name, year, reference points, areas), written as it is edited, so editing never copies the
 * picture again. Which map is open is a third, tiny record.
 *
 * Version 1 of the database held a single map under the keys `image` and `setup` of the store
 * `map`. Opening it at version 2 moves that map into the new stores, as the first of the list, and
 * removes the old store, so a map saved before the change is kept.
 */

import { LabsReadOnlyError, labsSession, labsWritable, trackWrite } from '@/lib/labs-session';

export const hunterMapDatabaseName = 'nilay-labs-hunter-map-v1';
const databaseVersion = 2;
const imageStore = 'images';
const setupStore = 'setups';
const stateStore = 'state';
const activeKey = 'active';
/** Set when the old single map could not be carried over, so the page can say it was lost. */
const droppedKey = 'migration-dropped';
const legacyStore = 'map';

let opening: Promise<IDBDatabase> | null = null;

/**
 * Carries the version 1 map across inside the upgrade transaction. The old record is copied as it
 * was; the page validates it like any other saved map and reports it if it cannot be read.
 */
function migrateFromVersion1(transaction: IDBTransaction, database: IDBDatabase) {
  if (!database.objectStoreNames.contains(legacyStore)) return;
  const legacy = transaction.objectStore(legacyStore);
  const imageRequest = legacy.get('image');
  const setupRequest = legacy.get('setup');
  setupRequest.onsuccess = () => {
    const image: unknown = imageRequest.result;
    const setup: unknown = setupRequest.result;
    const imageId =
      typeof image === 'object' && image !== null && 'id' in image && typeof image.id === 'string' ? image.id : null;
    const hasPoints =
      typeof setup === 'object' && setup !== null && 'points' in setup && Array.isArray(setup.points)
        ? setup.points.length > 0
        : false;
    if (imageId) {
      const name = 'name' in (image as object) ? (image as { name: unknown }).name : '';
      transaction.objectStore(imageStore).put(image, imageId);
      transaction.objectStore(setupStore).put(
        {
          ...(typeof setup === 'object' && setup !== null ? setup : {}),
          id: imageId,
          name: typeof name === 'string' ? name.slice(0, 100) : '',
          fiscalYear: null,
          zones: [],
        },
        imageId,
      );
      transaction.objectStore(stateStore).put(imageId, activeKey);
    } else if (setup !== undefined && hasPoints) {
      // Points with no picture have nothing to be read against.
      transaction.objectStore(stateStore).put(true, droppedKey);
    }
    database.deleteObjectStore(legacyStore);
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(hunterMapDatabaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of [imageStore, setupStore, stateStore])
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      if (request.transaction) migrateFromVersion1(request.transaction, database);
    };
    // Set once the attempt has been given up as blocked, so a connection that opens later is closed
    // rather than left holding the database for no one.
    let abandoned = false;
    request.onsuccess = () => {
      const database = request.result;
      if (abandoned) {
        database.close();
        return;
      }
      // Another tab opening a newer version needs this connection out of the way.
      database.onversionchange = () => {
        database.close();
        opening = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('IndexedDB is blocked'));
    };
  });
  // A refusal is not remembered, so a later attempt (after storage is freed) can succeed.
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

type Stores = typeof imageStore | typeof setupStore | typeof stateStore;

function run(
  stores: Stores[],
  mode: IDBTransactionMode,
  work: (store: (name: Stores) => IDBObjectStore) => IDBRequest[],
): Promise<unknown[]> {
  // Read or written only once this page holds its place among the open Labs pages (labs-session.ts).
  const running = labsSession()
    .then(() => {
      if (mode === 'readwrite' && !labsWritable()) throw new LabsReadOnlyError();
    })
    .then(openDatabase)
    .then(
      (database) =>
        new Promise<unknown[]>((resolve, reject) => {
          const transaction = database.transaction(stores, mode);
          const requests = work((name) => transaction.objectStore(name));
          transaction.oncomplete = () => resolve(requests.map((request) => request.result));
          transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
          transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
        }),
    );
  // A write is tracked until it lands, so the tab's lock is not given up under it.
  return mode === 'readwrite' ? trackWrite(running) : running;
}

export interface SavedCatalog {
  /** Every setup, unchecked: the store validates them and reports what it cannot read. */
  setups: unknown[];
  activeId: unknown;
  /** The single map of the old format had points but no picture, and was not carried over. */
  droppedLegacy: boolean;
}

export async function readCatalog(): Promise<SavedCatalog> {
  const [setups, activeId, dropped] = await run([setupStore, stateStore], 'readonly', (store) => [
    store(setupStore).getAll(),
    store(stateStore).get(activeKey),
    store(stateStore).get(droppedKey),
  ]);
  return { setups: (setups as unknown[]) ?? [], activeId, droppedLegacy: dropped === true };
}

/** One map's picture, unchecked. */
export async function readMapImage(id: string): Promise<unknown> {
  const [image] = await run([imageStore], 'readonly', (store) => [store(imageStore).get(id)]);
  return image;
}

/** A new map: its picture, its setup, and the note that it is the one open, in one transaction. */
export async function writeNewMap(id: string, image: unknown, setup: unknown): Promise<void> {
  await run([imageStore, setupStore, stateStore], 'readwrite', (store) => [
    store(imageStore).put(image, id),
    store(setupStore).put(setup, id),
    store(stateStore).put(id, activeKey),
    store(stateStore).delete(droppedKey),
  ]);
}

export async function writeMapSetup(id: string, setup: unknown): Promise<void> {
  await run([setupStore], 'readwrite', (store) => [store(setupStore).put(setup, id)]);
}

export async function writeActiveMap(id: string | null): Promise<void> {
  await run([stateStore], 'readwrite', (store) => [
    id === null ? store(stateStore).delete(activeKey) : store(stateStore).put(id, activeKey),
  ]);
}

/** Deletes one map, picture and setup together, and records which map is open afterwards. */
export async function deleteSavedMap(id: string, nextActiveId: string | null): Promise<void> {
  await run([imageStore, setupStore, stateStore], 'readwrite', (store) => [
    store(imageStore).delete(id),
    store(setupStore).delete(id),
    nextActiveId === null ? store(stateStore).delete(activeKey) : store(stateStore).put(nextActiveId, activeKey),
  ]);
}

export async function clearSavedMaps(): Promise<void> {
  await run([imageStore, setupStore, stateStore], 'readwrite', (store) => [
    store(imageStore).clear(),
    store(setupStore).clear(),
    store(stateStore).clear(),
  ]);
}

/** The picture's size in pixels, or null when the browser cannot draw it. */
export function readImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/*
 * Restoring a backup (the Labs data page), in steps that never hold every picture in memory and never
 * leave the list half replaced.
 *
 * `stageMapImage` writes each picture from the file under a key of the restore
 * (`restore:<token>:<id>`), and `stageMapCatalog` the setups and the open map, which no tool reads.
 * `commitStagedMaps` then swaps, in one transaction, every map for the staged ones, keeping the
 * replaced pictures, setups and open map under keys of their own (`trash:<token>…`), exactly as they
 * were stored, so `undoCommittedMaps` can put them back unchanged even where the current schema cannot
 * read them. `discardMapRestore` deletes whatever a restore left. The kept catalog says the swap
 * happened, so an undo after a restore that stopped before the swap changes nothing.
 */

const restorePrefix = (token: string) => `restore:${token}:`;
const trashPrefix = (token: string) => `trash:${token}:`;
const stagedCatalogKey = (token: string) => `restore:${token}`;
const trashCatalogKey = (token: string) => `trash:${token}`;
const prefixRange = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`);
/** Keys of the maps themselves, as opposed to those a restore writes. */
const isMapKey = (key: IDBValidKey) =>
  typeof key === 'string' && !key.startsWith('restore:') && !key.startsWith('trash:');

/** Ids a restore uses for its own records; no map from a file may take one. */
export function isRestoreKey(id: string): boolean {
  return !isMapKey(id);
}

/** Every map's id as stored, for reading the maps one at a time (the backup). */
export async function readMapIds(): Promise<string[]> {
  const [keys] = await run([setupStore], 'readonly', (store) => [store(setupStore).getAllKeys()]);
  return (keys as IDBValidKey[]).filter(isMapKey) as string[];
}

/** One map's setup and picture as stored, unchecked. */
export async function readMapRaw(id: string): Promise<{ setup: unknown; image: unknown }> {
  const [setup, image] = await run([setupStore, imageStore], 'readonly', (store) => [
    store(setupStore).get(id),
    store(imageStore).get(id),
  ]);
  return { setup, image };
}

export async function stageMapImage(token: string, id: string, image: unknown): Promise<void> {
  await run([imageStore], 'readwrite', (store) => [store(imageStore).put(image, `${restorePrefix(token)}${id}`)]);
}

export async function stageMapCatalog(token: string, setups: readonly { id: string }[], activeId: string | null) {
  await run([stateStore], 'readwrite', (store) => [
    store(stateStore).put({ setups, activeId }, stagedCatalogKey(token)),
  ]);
}

interface KeptCatalog {
  setups: [IDBValidKey, unknown][];
  activeId: unknown;
}

/** Moves every picture under `from` keys to their key with `rename`, one at a time, then calls `then`. */
function moveImages(
  images: IDBObjectStore,
  range: IDBKeyRange | null,
  include: (key: IDBValidKey) => boolean,
  rename: (key: IDBValidKey) => IDBValidKey,
  then: () => void,
) {
  const cursor = images.openCursor(range);
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current) {
      then();
      return;
    }
    if (include(current.key)) {
      images.put(current.value, rename(current.key));
      current.delete();
    }
    current.continue();
  };
}

/** Swaps every map for the ones staged, in one transaction. Refused if nothing was staged. */
export async function commitStagedMaps(token: string): Promise<void> {
  await run([imageStore, setupStore, stateStore], 'readwrite', (store) => {
    const images = store(imageStore);
    const setups = store(setupStore);
    const state = store(stateStore);
    const setupKeys = setups.getAllKeys();
    const setupValues = setups.getAll();
    const active = state.get(activeKey);
    const staged = state.get(stagedCatalogKey(token));
    staged.onsuccess = () => {
      const catalog = staged.result as { setups: { id: string }[]; activeId: string | null } | undefined;
      if (!catalog) {
        images.transaction.abort();
        return;
      }
      const kept: KeptCatalog = {
        setups: setupKeys.result.map((key, index) => [key, setupValues.result[index]]),
        activeId: active.result,
      };
      state.put(kept, trashCatalogKey(token));
      state.delete(stagedCatalogKey(token));
      setups.clear();
      for (const setup of catalog.setups) setups.put(setup, setup.id);
      if (catalog.activeId === null) state.delete(activeKey);
      else state.put(catalog.activeId, activeKey);
      moveImages(
        images,
        null,
        isMapKey,
        (key) => `${trashPrefix(token)}${String(key)}`,
        () =>
          moveImages(
            images,
            prefixRange(restorePrefix(token)),
            () => true,
            (key) => String(key).slice(restorePrefix(token).length),
            () => undefined,
          ),
      );
    };
    return [];
  });
}

/** Puts back the maps a swap replaced, as they were stored. Does nothing if the swap did not happen. */
export async function undoCommittedMaps(token: string): Promise<void> {
  await run([imageStore, setupStore, stateStore], 'readwrite', (store) => {
    const images = store(imageStore);
    const setups = store(setupStore);
    const state = store(stateStore);
    const kept = state.get(trashCatalogKey(token));
    kept.onsuccess = () => {
      const catalog = kept.result as KeptCatalog | undefined;
      if (!catalog) return;
      setups.clear();
      for (const [key, value] of catalog.setups) setups.put(value, key);
      if (catalog.activeId === undefined) state.delete(activeKey);
      else state.put(catalog.activeId, activeKey);
      state.delete(trashCatalogKey(token));
      const live = images.getAllKeys();
      live.onsuccess = () => {
        for (const key of live.result) if (isMapKey(key)) images.delete(key);
        moveImages(
          images,
          prefixRange(trashPrefix(token)),
          () => true,
          (key) => String(key).slice(trashPrefix(token).length),
          () => undefined,
        );
      };
    };
    return [];
  });
}

/** Deletes whatever a restore left: pictures and a catalog staged and not swapped in, and what a swap replaced. */
export async function discardMapRestore(token: string): Promise<void> {
  await run([imageStore, stateStore], 'readwrite', (store) => [
    store(imageStore).delete(prefixRange(restorePrefix(token))),
    store(imageStore).delete(prefixRange(trashPrefix(token))),
    store(stateStore).delete(stagedCatalogKey(token)),
    store(stateStore).delete(trashCatalogKey(token)),
  ]);
}
