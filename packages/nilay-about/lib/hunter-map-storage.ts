/**
 * The map picture and its reference points, kept in this browser's IndexedDB.
 *
 * A map picture runs to megabytes, beyond what localStorage holds, so it is stored as a Blob. It is
 * written only when a new picture is chosen; the reference points are a small record of their own,
 * written as they are edited, so editing a point never copies the picture again.
 */

import type { HunterMapSetup, SavedMapImage } from '@/lib/schemas/hunter-map';

export const hunterMapDatabaseName = 'nilay-labs-hunter-map-v1';
const storeName = 'map';
const imageKey = 'image';
const setupKey = 'setup';

let opening: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(hunterMapDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
  // A refusal is not remembered, so a later attempt (after storage is freed) can succeed.
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function run(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest[]): Promise<unknown[]> {
  return openDatabase().then(
    (database) =>
      new Promise<unknown[]>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const requests = work(transaction.objectStore(storeName));
        transaction.oncomplete = () => resolve(requests.map((request) => request.result));
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

/** What was saved, unchecked: the store validates it and reports what it cannot read. */
export async function readSavedMap(): Promise<{ image: unknown; setup: unknown }> {
  const [image, setup] = await run('readonly', (store) => [store.get(imageKey), store.get(setupKey)]);
  return { image, setup };
}

/** A new picture replaces the old one together with its points, in one transaction. */
export async function writeMapImage(image: SavedMapImage | null, setup: HunterMapSetup): Promise<void> {
  await run('readwrite', (store) => [
    image ? store.put(image, imageKey) : store.delete(imageKey),
    store.put(setup, setupKey),
  ]);
}

export async function writeMapSetup(setup: HunterMapSetup): Promise<void> {
  await run('readwrite', (store) => [store.put(setup, setupKey)]);
}

export async function clearSavedMap(): Promise<void> {
  await run('readwrite', (store) => [store.delete(imageKey), store.delete(setupKey)]);
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
