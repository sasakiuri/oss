import { z } from 'zod';

import { discardMapRestore, undoCommittedMaps } from '@/lib/hunter-map-storage';
import type { BackupPart } from '@/lib/labs-backup';
import { discardPhotoRestore, undoCommittedPhotos } from '@/lib/photo-storage';

/**
 * The note a restore keeps while it runs, so a restore cut short (the tab closed, the device off) is
 * undone before any Labs page reads its saved data again, rather than leaving some tools restored and
 * others not. It holds the localStorage values as they were, which are small; the maps and photos
 * that were replaced are kept in their own databases under keys of the restore.
 */
export const RESTORE_JOURNAL_KEY = 'nilay-labs-restore-journal-v1';

export const journalSchema = z.object({
  token: z.string().uuid(),
  /** `staging`: nothing is replaced yet. `committing`: parts may be replaced. `cleanup`: all were. */
  phase: z.enum(['staging', 'committing', 'cleanup']),
  /** Each key's value before the restore (null: none), and the value the restore writes. */
  local: z.array(z.object({ key: z.string(), before: z.string().nullable(), written: z.string() })),
  photoTools: z.array(z.string()),
  maps: z.boolean(),
  /**
   * Set when settling the restore failed. The tools then open read-only and do not try again, since a
   * later undo would take away what was saved in between; the data page settles it with the reader.
   */
  failed: z.boolean().optional(),
});
export type Journal = z.infer<typeof journalSchema>;

/** Writes the note; throws when localStorage refuses, which a restore must treat as a failure. */
export function saveJournal(journal: Journal): void {
  window.localStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));
}

export function removeJournal(): void {
  window.localStorage.removeItem(RESTORE_JOURNAL_KEY);
}

/**
 * The note as saved: none, a note, or `broken` when something is there that cannot be read (it is left
 * in place, so what happened is not forgotten, and reported).
 */
export function readJournal(): Journal | null | 'broken' {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(RESTORE_JOURNAL_KEY);
  } catch {
    // localStorage that refuses to be read holds no note this page could act on, and no restore can have
    // written one through it; the tools say that storage is unavailable. The data page, which restores,
    // checks the refusal itself and does not start.
    return null;
  }
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return 'broken';
  }
  const parsed = journalSchema.safeParse(value);
  return parsed.success ? parsed.data : 'broken';
}

/** Whether a restore cut short is waiting for the data page: its note cannot be read, or settling it failed. */
export function journalNeedsDataPage(journal: Journal | 'broken' | null = readJournal()): boolean {
  return journal === 'broken' || (journal !== null && journal.failed === true);
}

/**
 * Undoes what a restore replaced: the maps and each tool's photos from the copies kept under the
 * restore's keys, and each localStorage value that still holds what the restore wrote. Returns the
 * parts that could not be put back.
 */
export async function undoRestore(journal: Journal): Promise<BackupPart[]> {
  const uncertain: BackupPart[] = [];
  if (journal.maps) await undoCommittedMaps(journal.token).catch(() => uncertain.push({ kind: 'hunter-map' }));
  for (const tool of [...journal.photoTools].reverse())
    await undoCommittedPhotos(journal.token, tool).catch(() => uncertain.push({ kind: 'photos', tool }));
  for (const { key, before, written } of journal.local) {
    const part = { kind: 'storage', key } as const;
    try {
      const now = window.localStorage.getItem(key);
      if (now === before) continue;
      // No other Labs page can be open during a restore, so anything else is not a value this restore knows.
      if (now !== written) {
        uncertain.push(part);
        continue;
      }
      if (before === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, before);
    } catch {
      uncertain.push(part);
    }
  }
  return uncertain;
}

/** Deletes what a restore staged or kept aside. Harmless to repeat; what is left is only unused space. */
export async function discardRestore(token: string): Promise<boolean> {
  const results = await Promise.allSettled([discardPhotoRestore(token), discardMapRestore(token)]);
  return results.every((result) => result.status === 'fulfilled');
}

/**
 * `none`: nothing to settle. `undone` / `finished`: a restore cut short was undone, or tidied after it had
 * replaced everything. `failed`: it could not be settled, and waits for the data page. `waiting`: it
 * could not be settled yet, because another Labs page is open.
 */
export type RecoveryResult = 'none' | 'undone' | 'finished' | 'failed' | 'waiting';

/** Marks the note as failed, so no page tries again on its own. Best effort: the note may not be writable. */
function markFailed(journal: Journal): void {
  try {
    saveJournal({ ...journal, failed: true });
  } catch {
    // Still `failed` for this page; the next one finds the note as it was and tries once more.
  }
}

/**
 * Settles what a restore cut short left: undoes one stopped while replacing, or tidies one that had
 * replaced everything. Must run while no Labs page is reading or saving (under the exclusive lock of
 * `labs-session.ts`). Never throws: whatever goes wrong is `failed`, and the note is kept and marked so.
 */
export async function recoverRestore(): Promise<RecoveryResult> {
  const journal = readJournal();
  if (journal === null) return 'none';
  if (journal === 'broken') return 'failed';
  try {
    if (journal.phase === 'committing' && (await undoRestore(journal)).length > 0) {
      markFailed(journal);
      return 'failed';
    }
    if (!(await discardRestore(journal.token))) {
      markFailed(journal);
      return 'failed';
    }
    removeJournal();
  } catch {
    markFailed(journal);
    return 'failed';
  }
  return journal.phase === 'cleanup' ? 'finished' : 'undone';
}

/**
 * The reader's way out of a restore that could not be settled: forgets the note and deletes what the
 * restore kept aside, leaving the data as it is now. Run under the exclusive lock, from the data page.
 */
export async function abandonRestore(): Promise<boolean> {
  const journal = readJournal();
  try {
    if (journal !== null && journal !== 'broken' && !(await discardRestore(journal.token))) return false;
    removeJournal();
    return true;
  } catch {
    return false;
  }
}

/** Clears the failed mark, so the data page can try settling once more. */
export function retryableJournal(): boolean {
  const journal = readJournal();
  if (journal === null || journal === 'broken') return false;
  try {
    saveJournal({ ...journal, failed: false });
    return true;
  } catch {
    return false;
  }
}
