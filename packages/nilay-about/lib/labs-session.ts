import { create } from 'zustand';

import { journalNeedsDataPage, readJournal, recoverRestore, type RecoveryResult } from '@/lib/labs-restore-journal';

/**
 * Keeping a backup restore apart from every Labs page that reads or saves.
 *
 * Each Labs tool page holds a shared Web Lock, `nilay-labs-open`, from before it first reads what the
 * tools saved (localStorage through `browserStorage`, and the photo and map databases) until it is
 * closed. The data page takes the same lock shared while it reads the device to export it, and
 * exclusively, and only if it is free, to restore: while any other Labs page is open the restore does
 * not start. A page opened during a restore waits for the lock before it reads anything, so it never
 * saves over what is being restored, and never exports a device half restored.
 *
 * A restore cut short (its tab closed) leaves a note; the next Labs page to open settles it under the
 * exclusive lock before it reads anything. If that fails, the note is marked, and every tool page opens
 * read-only and does not try again: an undo that later succeeds would take away what was saved in
 * between. The data page settles it with the reader.
 *
 * Without Web Locks (browsers before Safari 15.4, or with Lockdown Mode) a note is still settled before
 * anything is read, and the data page refuses to restore, since other tabs cannot be kept out.
 */

export const LABS_LOCK = 'nilay-labs-open';

/** How settling an interrupted restore went in this tab. `failed` makes the tool pages read-only. */
export const useRecovery = create<{ result: RecoveryResult }>(() => ({ result: 'none' }));

let mode: 'tool' | 'data' = 'tool';
let session: Promise<void> | null = null;
/** Set once the session is open: the shared lock held, or no Web Locks to take. */
let opened = false;
let release: (() => void) | null = null;
/** Settles once the shared lock this tab held is released, as the browser reports it. */
let held: Promise<unknown> = Promise.resolve();
/** Settles once the tab has given up its tool session for the data page: writes landed, lock released. */
let leaving: Promise<unknown> = Promise.resolve();
/** Cancels a shared lock still being waited for, when the tab moves to the data page meanwhile. */
let waiting: AbortController | null = null;
/** Set while the session settles an interrupted restore, whose own reads and writes must not wait on it. */
let settling = false;

const locks = () => (typeof navigator === 'undefined' ? undefined : navigator.locks);

async function settle(): Promise<void> {
  settling = true;
  try {
    useRecovery.setState({ result: await recoverRestore() });
  } finally {
    settling = false;
  }
}

/**
 * Settles a note left by a restore cut short, unless it already waits for the data page. Returns false
 * when the wait for the lock was given up, because the tab moved to the data page meanwhile.
 */
async function settleInterrupted(signal: AbortSignal): Promise<boolean> {
  const journal = readJournal();
  if (journal === null) return true;
  if (journalNeedsDataPage(journal)) {
    useRecovery.setState({ result: 'failed' });
    return true;
  }
  const manager = locks();
  if (!manager) {
    await settle();
    return true;
  }
  return manager.request(LABS_LOCK, { mode: 'exclusive', signal }, settle).then(
    () => true,
    () => false,
  );
}

async function open(): Promise<void> {
  // One signal for every wait of this session, the exclusive one to settle a note and the shared one,
  // so a tab that moves to the data page meanwhile leaves no request behind to be granted later.
  const controller = new AbortController();
  waiting = controller;
  const manager = locks();
  if (!manager) {
    await settleInterrupted(controller.signal);
    return;
  }
  // Twice at most: a restore can be cut short while this page waits for the shared lock.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(await settleInterrupted(controller.signal)) || controller.signal.aborted) return;
    const granted = await new Promise<boolean>((resolve) => {
      held = manager
        .request(LABS_LOCK, { mode: 'shared', signal: controller.signal }, () => {
          resolve(true);
          // Held until the page is closed, or given back to settle a note found below.
          return new Promise<void>((done) => (release = done));
        })
        .catch(() => resolve(false));
    });
    // Given up for the data page, which reads without this lock of its own.
    if (!granted) return;
    if (readJournal() === null || useRecovery.getState().result === 'failed') break;
    release?.();
    release = null;
  }
  if (waiting === controller) waiting = null;
}

/**
 * Resolves once this page may read the tools' data: at once on the data page and while an interrupted
 * restore is being settled, otherwise when the shared lock is held.
 */
export function labsSession(): Promise<void> {
  if (mode === 'data' || settling) return Promise.resolve();
  if (!session) {
    const current: Promise<void> = open().then(() => {
      // A session given up for the data page meanwhile is not the one open now.
      if (session === current) opened = true;
    });
    session = current;
  }
  return session;
}

/** Whether a read can go ahead without waiting, so saved data is still read at once when it can be. */
export function labsSessionReady(): boolean {
  // Without Web Locks there is no lock to wait for; only a note to settle first would make a read wait.
  return mode === 'data' || settling || opened || (!locks() && readJournal() === null);
}

/** Writes of the data page's own restore or settling, the only ones it lets through. */
let dataPageWrites = 0;

/**
 * Whether this page may save. A tool page may not while a restore cut short waits for the data page:
 * what it saved would be lost to the undo that settles it. On the data page only its own restore and
 * settling write (`asDataPage`): a tool screen left behind by an in-app move, still finishing a photo,
 * must not write beside a restore or an export.
 */
export function labsWritable(): boolean {
  if (settling) return true;
  if (mode === 'data') return dataPageWrites > 0;
  return useRecovery.getState().result !== 'failed';
}

/** Runs the data page's own writes: a restore, or settling a cut-short one. */
export async function asDataPage<T>(work: () => Promise<T>): Promise<T> {
  dataPageWrites += 1;
  try {
    return await work();
  } finally {
    dataPageWrites -= 1;
  }
}

/** Writes to IndexedDB still under way, which the lock is kept for until they have landed. */
const pendingWrites = new Set<Promise<unknown>>();

/** Keeps track of an IndexedDB write until it lands or fails. */
export function trackWrite<T>(write: Promise<T>): Promise<T> {
  pendingWrites.add(write);
  const done = () => pendingWrites.delete(write);
  write.then(done, done);
  return write;
}

/** Resolves once every IndexedDB write this tab had under way has landed or failed. */
export async function writesSettled(): Promise<void> {
  while (pendingWrites.size > 0) await Promise.allSettled([...pendingWrites]);
}

/** Thrown by a write refused while a restore cut short waits for the data page. */
export class LabsReadOnlyError extends Error {
  constructor() {
    super('A restore that was cut short has to be settled on the data page first');
    this.name = 'LabsReadOnlyError';
  }
}

/**
 * The data page: gives up the shared lock this tab may hold, or still be waiting for, from a tool
 * opened earlier, so the page's own restore is not kept out by it. The data page takes the lock itself
 * as it reads and restores. Returns the way back, for when the page is left for a tool, which then
 * opens a session of its own.
 */
export function enterDataPage(): () => void {
  mode = 'data';
  waiting?.abort();
  waiting = null;
  // A write the tool screen had under way lands before the lock goes, so a restore or an export that
  // takes the lock after it finds the device as that write left it.
  const giveUp = release;
  const released = held;
  leaving = writesSettled().then(() => {
    giveUp?.();
    return released;
  });
  release = null;
  session = null;
  opened = false;
  return () => {
    mode = 'tool';
  };
}

/**
 * Settles once this tab, moved to the data page, has nothing of a tool session left: the writes a tool
 * screen had under way have landed and the shared lock is released. The data page waits for it before
 * it exports or restores.
 */
export async function toolSessionLeft(): Promise<void> {
  await leaving;
  await writesSettled();
}
