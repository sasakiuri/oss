import {
  commitStagedMaps,
  isRestoreKey as isMapRestoreKey,
  readCatalog,
  readImageSize,
  readMapIds,
  readMapRaw,
  stageMapCatalog,
  stageMapImage,
} from '@/lib/hunter-map-storage';
import {
  BACKUP_MAX_BYTES,
  BACKUP_MIME_TYPE,
  estimateMapBytes,
  estimatePhotoBytes,
  headerLine,
  mapLines,
  photoLine,
  planBackup,
  planItems,
  readLines,
  type BackupPart,
  type HunterMapHeader,
  type ImportPlan,
  type ImportRules,
  type ReadBackupResult,
} from '@/lib/labs-backup';
import {
  RESTORE_JOURNAL_KEY,
  abandonRestore,
  discardRestore,
  journalNeedsDataPage,
  readJournal,
  retryableJournal,
  recoverRestore,
  removeJournal,
  saveJournal,
  undoRestore,
  type Journal,
  type RecoveryResult,
} from '@/lib/labs-restore-journal';
import { LABS_LOCK, asDataPage, toolSessionLeft, useRecovery } from '@/lib/labs-session';
import { acceptsPersisted, persistedKey } from '@/lib/persisted-store';
import {
  commitStagedPhotos,
  isRestoreKey as isPhotoRestoreKey,
  readPhotoRaw,
  readToolPhotoIds,
  stagePhoto,
} from '@/lib/photo-storage';
import {
  hunterMapSetupSchema,
  savedMapImageSchema,
  type HunterMapSetup,
  type SavedMapImage,
} from '@/lib/schemas/hunter-map';
import { savedPhotoSchema, type SavedPhoto } from '@/lib/schemas/photos';

import { photoRecords, photoTools, savedDataEntries, savedDataEntry, type SavedDataEntry } from './saved-data';

const pictureDecodes = async (data: ArrayBuffer, type: string, width: number, height: number) => {
  const size = await readImageSize(new Blob([data], { type }));
  return size !== null && size.width === width && size.height === height;
};

const rules: ImportRules = {
  accepts: (key, value) => {
    const entry = savedDataEntry(key);
    return entry ? acceptsPersisted(entry.store, value) : undefined;
  },
  photoRecords,
  pictureDecodes,
};

/** A localStorage value, null when there is none, or `unreadable` when the browser refuses to read it. */
function readLocal(key: string): string | null | 'unreadable' {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return 'unreadable';
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// ---- Export ----

/** What went into a backup, and what could not be read and was left out. */
export interface BackupSummary {
  included: SavedDataEntry[];
  /** Saved values the tool itself would refuse, so a backup of them would restore nothing. */
  unreadable: SavedDataEntry[];
  maps: number | 'unavailable';
  /** Maps left out because their setup or picture cannot be read, as the map tool would drop them. */
  mapsLeftOut: number;
  photos: number | 'unavailable';
  /** Photos left out: ones the photo schema refuses, and ones whose record is no longer there. */
  photosLeftOut: number;
}

export type CollectedBackup =
  | { state: 'ready'; blob: Blob; summary: BackupSummary }
  /** The file would be larger than a file the page reads back, so none of it was made. */
  | { state: 'too-large'; bytes: number }
  /** Something was saved or deleted while the file was being made; nothing is offered. */
  | { state: 'changed' }
  /** A restore cut short has not been settled, so the device is half restored and is not exported. */
  | { state: 'interrupted' };

/** A map as the map tool would open it, or null. */
function readableMap(raw: { setup: unknown; image: unknown }): { setup: HunterMapSetup; image: SavedMapImage } | null {
  const setup = hunterMapSetupSchema.safeParse(raw.setup);
  const image = savedMapImageSchema.safeParse(raw.image);
  if (!setup.success || !image.success || image.data.id !== setup.data.id || isMapRestoreKey(setup.data.id))
    return null;
  return { setup: setup.data, image: image.data };
}

/** A photo as the tools would show it, belonging to one of these records, or null. */
function readablePhoto(raw: unknown, tool: string, owners: ReadonlySet<string>): SavedPhoto | null {
  const photo = savedPhotoSchema.safeParse(raw);
  if (!photo.success || photo.data.tool !== tool || !owners.has(photo.data.ownerId) || isPhotoRestoreKey(photo.data.id))
    return null;
  return photo.data;
}

/**
 * Builds the backup file, one map or photo at a time, so no more than one picture is held in memory.
 *
 * A first pass reads each map and photo only to check it and add up the size the file would take; the
 * file is made only if that is within `BACKUP_MAX_BYTES`. The second pass reads them again and appends
 * each line to the file as it goes. Maps and photos are checked the way a restore checks them, so what
 * the file holds reads back whole; what would not (and what the tools themselves would drop) is left
 * out and counted. Reading the device changes nothing.
 */
async function collect(now: Date): Promise<CollectedBackup> {
  const localStorage: Record<string, unknown> = {};
  const included: SavedDataEntry[] = [];
  const unreadable: SavedDataEntry[] = [];
  for (const entry of savedDataEntries) {
    const key = persistedKey(entry.store);
    const raw = readLocal(key);
    if (raw === null) continue;
    const value = raw === 'unreadable' ? undefined : parseJson(raw);
    if (acceptsPersisted(entry.store, value)) {
      localStorage[key] = value;
      included.push(entry);
    } else unreadable.push(entry);
  }

  let estimate = 0;
  // Maps: which to write, and the one open.
  let mapIds: string[] = [];
  let mapsLeftOut = 0;
  let hunterMap: HunterMapHeader;
  try {
    const all = await readMapIds();
    for (const id of all) {
      const map = readableMap(await readMapRaw(id));
      // The picture is drawn as a restore would draw it; maps are few, so this costs little.
      if (!map || !(await pictureDecodes(map.image.data, map.image.type, map.image.width, map.image.height))) {
        mapsLeftOut += 1;
        continue;
      }
      mapIds.push(id);
      estimate += estimateMapBytes(map.setup, map.image);
    }
    const active = (await readCatalog()).activeId;
    const activeId = typeof active === 'string' && mapIds.includes(active) ? active : null;
    // Maps that are there but all unreadable are not written as “no maps”: restoring that would clear the device's.
    hunterMap =
      mapIds.length > 0
        ? { status: 'saved', maps: mapIds.length, activeId }
        : all.length === 0
          ? { status: 'empty' }
          : { status: 'not-included' };
  } catch {
    mapIds = [];
    hunterMap = { status: 'not-included' };
  }

  // Photos travel with their records: only the tools whose records are in the file carry theirs, and
  // only the photos of records that are there.
  const photoIds: { tool: string; ids: string[]; owners: ReadonlySet<string> }[] = [];
  let photoCounts: Record<string, number> | null = {};
  let photosLeftOut = 0;
  try {
    for (const tool of photoTools) {
      const records = photoRecords(tool);
      if (!records || !(records.key in localStorage)) continue;
      const owners = records.ids(localStorage[records.key]);
      const ids: string[] = [];
      for (const id of await readToolPhotoIds(tool)) {
        const photo = readablePhoto(await readPhotoRaw(id), tool, owners);
        if (!photo) {
          photosLeftOut += 1;
          continue;
        }
        ids.push(id);
        estimate += estimatePhotoBytes(photo);
      }
      photoIds.push({ tool, ids, owners });
      photoCounts[tool] = ids.length;
    }
  } catch {
    photoIds.length = 0;
    photoCounts = null;
  }

  const header = headerLine({ exportedAt: now.toISOString(), localStorage, hunterMap, photos: photoCounts });
  estimate += new TextEncoder().encode(header).length;
  if (estimate > BACKUP_MAX_BYTES) return { state: 'too-large', bytes: estimate };

  // Each line is added to the file as it is made, so only the file (which the browser may keep on disk)
  // and one line are held at a time.
  let blob = new Blob([header], { type: BACKUP_MIME_TYPE });
  try {
    for (const id of mapIds) {
      const map = readableMap(await readMapRaw(id));
      if (!map) return { state: 'changed' };
      // A chunk of the picture at a time, so its base64 is never held whole.
      for (const line of mapLines(map.setup, map.image)) blob = new Blob([blob, line], { type: BACKUP_MIME_TYPE });
    }
    for (const { tool, ids, owners } of photoIds)
      for (const id of ids) {
        const photo = readablePhoto(await readPhotoRaw(id), tool, owners);
        if (!photo) return { state: 'changed' };
        blob = new Blob([blob, photoLine(photo)], { type: BACKUP_MIME_TYPE });
      }
  } catch {
    return { state: 'changed' };
  }
  return {
    state: 'ready',
    blob,
    summary: {
      included,
      unreadable,
      maps: hunterMap.status === 'not-included' && mapsLeftOut === 0 ? 'unavailable' : mapIds.length,
      mapsLeftOut,
      photos: photoCounts === null ? 'unavailable' : Object.values(photoCounts).reduce((sum, count) => sum + count, 0),
      photosLeftOut,
    },
  };
}

/**
 * Builds the backup file while holding the Labs lock shared, as the tool pages do: a restore in another
 * tab holds it exclusively, so the device is never read half restored. A restore cut short that has not
 * been settled is not exported either.
 */
export async function collectBackup(now: Date): Promise<CollectedBackup> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  const read = () => (readJournal() === null ? collect(now) : Promise.resolve({ state: 'interrupted' } as const));
  // A write a tool screen left under way in this tab lands first, so the file has it.
  await toolSessionLeft();
  if (!locks) return read();
  return locks.request(LABS_LOCK, { mode: 'shared' }, read);
}

// ---- Restore ----

/** Plans a restore from a backup file, reading it a line at a time and checking each part with its tool's rules. */
export function planRestore(file: Blob): Promise<ReadBackupResult> {
  return planBackup(readLines(file), rules, file.size);
}

export type RestoreResult =
  | { state: 'restored'; parts: BackupPart[] }
  /**
   * Nothing was written. `other-tabs`: another Labs page is open (or restoring). `unreadable`: what is on
   * the device could not be read to keep a copy of it. `unwritable`: the note that lets an interrupted
   * restore be undone could not be saved. `unsupported`: this browser has no Web Locks, so other tabs
   * cannot be kept out. `interrupted`: a restore cut short earlier could not be undone or tidied.
   */
  | { state: 'not-started'; reason: 'other-tabs' | 'unreadable' | 'unwritable' | 'unsupported' | 'interrupted' }
  /** A write failed and everything written was put back. */
  | { state: 'rolled-back'; failed: BackupPart }
  /** A write failed and putting back what was there failed too; `uncertain` may be left changed. */
  | { state: 'rollback-failed'; failed: BackupPart; uncertain: BackupPart[] };

export type { RecoveryResult };

/**
 * Settles a restore cut short, for the data page as it opens. Every other Labs page does the same before
 * it reads anything (`labs-session.ts`). Here it runs only while no other Labs page is open (`waiting`
 * otherwise), and not at all for a restore whose settling already failed, which waits for the reader.
 */
export async function recoverInterruptedRestore(): Promise<RecoveryResult> {
  const journal = readJournal();
  if (journal === null) return 'none';
  if (journalNeedsDataPage(journal)) return 'failed';
  return settleExclusively(recoverRestore);
}

/** Runs a settling step under the exclusive Labs lock, or reports `waiting` while another page holds it. */
async function settleExclusively(step: () => Promise<RecoveryResult>): Promise<RecoveryResult> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  const run = async () => {
    const result = await asDataPage(step);
    useRecovery.setState({ result });
    return result;
  };
  if (!locks) return run();
  return locks.request(LABS_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) =>
    lock ? run() : ('waiting' as const),
  );
}

/** The reader asks to try settling a restore cut short once more. */
export function retryInterruptedRestore(): Promise<RecoveryResult> {
  return settleExclusively(async () => (retryableJournal() ? recoverRestore() : 'failed'));
}

/**
 * The reader gives up on a restore cut short: its note and what it kept aside are deleted, and the data
 * stays as it is now, part restored as it may be.
 */
export function abandonInterruptedRestore(): Promise<RecoveryResult> {
  return settleExclusively(async () => ((await abandonRestore()) ? 'none' : 'failed'));
}

async function run(file: Blob, plan: ImportPlan): Promise<RestoreResult> {
  // A device whose localStorage cannot be read cannot keep the note that makes a restore safe.
  if (readLocal(RESTORE_JOURNAL_KEY) === 'unreadable') return { state: 'not-started', reason: 'unreadable' };
  // A restore cut short earlier is settled first; one that cannot be is not built on, nor tried again here.
  if (journalNeedsDataPage() || (await recoverRestore()) === 'failed')
    return { state: 'not-started', reason: 'interrupted' };
  const token = crypto.randomUUID();
  const journal: Journal = {
    token,
    phase: 'staging',
    local: [],
    photoTools: plan.photos.map(({ tool }) => tool),
    maps: plan.hunterMap !== null,
  };
  for (const { key, value } of plan.storage) {
    const before = readLocal(key);
    if (before === 'unreadable') return { state: 'not-started', reason: 'unreadable' };
    journal.local.push({ key, before, written: JSON.stringify(value) });
  }
  try {
    saveJournal(journal);
  } catch {
    return { state: 'not-started', reason: 'unwritable' };
  }

  let current: BackupPart = plan.photos[0] ? { kind: 'photos', tool: plan.photos[0].tool } : { kind: 'hunter-map' };
  const fail = async (): Promise<RestoreResult> => {
    const uncertain = journal.phase === 'staging' ? [] : await undoRestore(journal);
    const tidy = await discardRestore(token);
    if (uncertain.length === 0 && tidy) removeJournal();
    return uncertain.length > 0
      ? { state: 'rollback-failed', failed: current, uncertain }
      : { state: 'rolled-back', failed: current };
  };

  // Staging: the pictures and photos from the file go in under the restore's keys, where no tool reads them.
  try {
    const map = plan.hunterMap;
    if (map) {
      current = { kind: 'hunter-map' };
      await stageMapCatalog(
        token,
        map.action === 'replace' ? map.setups : [],
        map.action === 'replace' ? map.activeId : null,
      );
    }
    for await (const item of planItems(readLines(file), plan, file.size)) {
      if (item.kind === 'map') {
        current = { kind: 'hunter-map' };
        await stageMapImage(token, item.image.id, item.image);
      } else {
        current = { kind: 'photos', tool: item.photo.tool };
        await stagePhoto(token, item.photo);
      }
    }
  } catch {
    return fail();
  }

  // Replacing: each part is swapped in; what it replaced is kept until every part has been swapped.
  try {
    journal.phase = 'committing';
    saveJournal(journal);
    for (const { key, written } of journal.local) {
      current = { kind: 'storage', key };
      window.localStorage.setItem(key, written);
    }
    for (const tool of journal.photoTools) {
      current = { kind: 'photos', tool };
      await commitStagedPhotos(token, tool);
    }
    if (journal.maps) {
      current = { kind: 'hunter-map' };
      await commitStagedMaps(token);
    }
    // Only once the note says every part is in is the restore done: a note left at `committing` would
    // have the next Labs page undo it all.
    journal.phase = 'cleanup';
    saveJournal(journal);
  } catch {
    return fail();
  }

  // What was replaced is deleted; if that fails, it is only space, tidied by the next Labs page.
  if (await discardRestore(token)) {
    try {
      removeJournal();
    } catch {
      // The note says `cleanup`, which the next Labs page tidies without undoing anything.
    }
  }
  return {
    state: 'restored',
    parts: [
      ...plan.storage.map(({ key }) => ({ kind: 'storage', key }) as const),
      ...plan.photos.map(({ tool }) => ({ kind: 'photos', tool }) as const),
      ...(plan.hunterMap ? [{ kind: 'hunter-map' } as const] : []),
    ],
  };
}

/**
 * Restores a checked plan from its file as one unit: the tools' saved state, the maps and the photos go
 * in together or not at all. Each tool's part replaces what that tool has now; tools the file does not
 * mention are left alone. It starts only when no other Labs page is open, and holds the lock every Labs
 * page takes before it reads, so none can open and save while it runs.
 */
export async function applyRestore(file: Blob, plan: ImportPlan): Promise<RestoreResult> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return { state: 'not-started', reason: 'unsupported' };
  // A write a tool screen left under way in this tab lands, and gives up the tab's lock, first.
  await toolSessionLeft();
  return locks.request(LABS_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) =>
    lock ? asDataPage(() => run(file, plan)) : { state: 'not-started', reason: 'other-tabs' },
  );
}
