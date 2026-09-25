/**
 * Fetching a model file once, with the reader's consent, and keeping it in this browser.
 *
 * The analysis tools run a published model on the device, so the photo or recording never leaves
 * it. The model itself does have to arrive, and it is tens of megabytes: it is fetched only after
 * the reader has been told its size and where it comes from and has pressed the button, checked
 * against the SHA-256 recorded here, and kept in the Cache Storage of this origin so the next visit
 * does not fetch it again. A file whose hash does not match is thrown away, never run.
 */

export interface ModelFile {
  /** Where the file is fetched from. Pinned to a revision, so the bytes behind it cannot change. */
  url: string;
  /** Lower-case hex SHA-256 of the file. */
  sha256: string;
  /** The size shown before the download, in bytes. */
  bytes: number;
}

export const MODEL_CACHE_NAME = 'nilay-labs-models-v1';

export class ModelIntegrityError extends Error {
  constructor(url: string) {
    super(`The downloaded file does not match its recorded SHA-256: ${url}`);
    this.name = 'ModelIntegrityError';
  }
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/** Whether this browser can keep the file between visits at all. */
export function modelCacheAvailable(): boolean {
  return typeof caches !== 'undefined';
}

async function openCache(): Promise<Cache | null> {
  if (!modelCacheAvailable()) return null;
  try {
    return await caches.open(MODEL_CACHE_NAME);
  } catch {
    // A private window can refuse storage even where the API exists.
    return null;
  }
}

/**
 * Writing and deleting model files take turns across every tab and every opening of the page, under
 * one exclusive Web Lock: a write begun before a delete finishes before the delete starts, and cannot
 * land after it. Without Web Locks nothing is written (the screen says the model was not kept), so a
 * delete there has nothing to race.
 */
const MODEL_FILES_LOCK = 'nilay-labs-model-files';

const modelLocks = () => (typeof navigator === 'undefined' ? undefined : navigator.locks);

/** The kept copy, checked again: storage can be damaged, and a wrong file must not run. */
export async function readCachedModel(file: ModelFile): Promise<ArrayBuffer | null> {
  const cache = await openCache();
  const response = await cache?.match(file.url);
  if (!response) return null;
  const data = await response.arrayBuffer();
  if ((await sha256Hex(data)) === file.sha256) return data;
  // Removed under the shared lock, and only if still wrong: another tab may have just saved a good copy.
  const removeIfDamaged = async () => {
    const kept = await cache?.match(file.url);
    if (kept && (await sha256Hex(await kept.arrayBuffer())) !== file.sha256) await cache?.delete(file.url);
  };
  const locks = modelLocks();
  if (locks) await locks.request(MODEL_FILES_LOCK, { mode: 'exclusive' }, removeIfDamaged);
  else await removeIfDamaged();
  return null;
}

export async function isModelCached(file: ModelFile): Promise<boolean> {
  const cache = await openCache();
  return (await cache?.match(file.url)) !== undefined;
}

export async function deleteCachedModel(file: ModelFile): Promise<void> {
  const remove = async () => {
    const cache = await openCache();
    await cache?.delete(file.url);
  };
  const locks = modelLocks();
  if (!locks) return remove();
  await locks.request(MODEL_FILES_LOCK, { mode: 'exclusive' }, remove);
}

export interface DownloadedModel {
  data: ArrayBuffer;
  /** False when the browser would not keep it, so the next visit downloads it again. The screen says so. */
  kept: boolean;
}

/**
 * Downloads, verifies and keeps one file. `onProgress` receives the fraction received so far,
 * measured against the recorded size because a compressed response has no usable length.
 */
export async function downloadModel(
  file: ModelFile,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<DownloadedModel> {
  // No credentials, referrer or user content are sent; the host still sees the request itself (address, time, headers).
  const response = await fetch(file.url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok || !response.body) throw new Error(`Model download failed with HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    // A response larger than the recorded file is wrong, and is not read on into the phone's memory.
    if (received > file.bytes) {
      await reader.cancel();
      throw new ModelIntegrityError(file.url);
    }
    chunks.push(value);
    onProgress(Math.min(1, received / file.bytes));
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (received !== file.bytes || (await sha256Hex(data.buffer)) !== file.sha256)
    throw new ModelIntegrityError(file.url);
  signal?.throwIfAborted();
  const locks = modelLocks();
  const keep = async (): Promise<boolean> => {
    // A delete aborts the download; once it has, the file must not be written back behind it.
    signal?.throwIfAborted();
    const cache = await openCache();
    if (!cache) return false;
    try {
      await cache.put(file.url, new Response(data.buffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
      return true;
    } catch {
      // A full quota: the model still runs this time, and the screen says it was not kept.
      return false;
    }
  };
  const kept = locks ? await locks.request(MODEL_FILES_LOCK, { mode: 'exclusive' }, keep) : false;
  return { data: data.buffer, kept };
}
