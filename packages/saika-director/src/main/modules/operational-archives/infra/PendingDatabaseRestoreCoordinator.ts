import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import Database from 'better-sqlite3';

import { parseRestoreMarker, PENDING_RESTORE_DATABASE, PENDING_RESTORE_MARKER } from './SqliteDatabaseBackupGateway';

export interface PendingRestoreApplicationResult {
  readonly applied: boolean;
  readonly sourceFileName?: string;
  readonly recoveryPath?: string;
  readonly error?: string;
}

/**
 * Applies a verified restore before the application database is opened.
 * The previous database is retained beside it as a timestamped recovery copy.
 */
export function applyPendingDatabaseRestoreSync(
  activeDatabasePath: string,
  stagingDirectory: string,
): PendingRestoreApplicationResult {
  const markerPath = join(stagingDirectory, PENDING_RESTORE_MARKER);
  if (!existsSync(markerPath)) return { applied: false };

  const pendingPath = join(stagingDirectory, PENDING_RESTORE_DATABASE);
  const replacementPath = `${activeDatabasePath}.restore-new`;
  let recoveryPath: string | undefined;
  try {
    const marker = parseRestoreMarker(readFileSync(markerPath, 'utf8'));
    if (!existsSync(pendingPath)) throw new Error('The staged database file is missing');
    if (sha256FileSync(pendingPath) !== marker.stagedSha256) {
      throw new Error('The staged database digest no longer matches the inspected candidate');
    }
    assertRestorableDatabase(pendingPath, marker.schemaVersion);

    rmSync(replacementPath, { force: true });
    copyFileSync(pendingPath, replacementPath);
    if (sha256FileSync(replacementPath) !== marker.stagedSha256) {
      throw new Error('The replacement database copy failed verification');
    }

    if (existsSync(activeDatabasePath)) {
      checkpointAndClose(activeDatabasePath);
      recoveryPath = nextRecoveryPath(activeDatabasePath);
      displaceActiveDatabase(activeDatabasePath, recoveryPath);
    }

    try {
      renameSync(replacementPath, activeDatabasePath);
      assertRestorableDatabase(activeDatabasePath, marker.schemaVersion);
    } catch (error) {
      removeDatabaseFiles(activeDatabasePath);
      if (recoveryPath && existsSync(recoveryPath)) restoreRecoveryDatabase(activeDatabasePath, recoveryPath);
      throw error;
    }
    try {
      // Remove the control marker first. Once it is gone, an orphaned staged
      // copy is harmless and the verified replacement will not be replayed.
      rmSync(markerPath, { force: true });
    } catch (error) {
      removeDatabaseFiles(activeDatabasePath);
      if (recoveryPath && existsSync(recoveryPath)) restoreRecoveryDatabase(activeDatabasePath, recoveryPath);
      throw error;
    }
    try {
      rmSync(pendingPath, { force: true });
    } catch {
      // The removed marker prevents replay. Failure to delete the staged file
      // does not invalidate the completed restore.
    }
    return {
      applied: true,
      sourceFileName: marker.sourceFileName,
      ...(recoveryPath ? { recoveryPath } : {}),
    };
  } catch (error) {
    rmSync(replacementPath, { force: true });
    return { applied: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function checkpointAndClose(path: string): void {
  const database = new Database(path);
  try {
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

function assertRestorableDatabase(path: string, expectedSchemaVersion: number): void {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrityRows = database.pragma('integrity_check') as Array<Record<string, unknown>>;
    if (integrityRows.length !== 1 || Object.values(integrityRows[0] ?? {})[0] !== 'ok') {
      throw new Error('The staged database failed its startup integrity check');
    }
    const row = database.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
      { value: string } | undefined;
    if (!row || Number(row.value) !== expectedSchemaVersion) {
      throw new Error('The staged database schema changed after it was selected');
    }
  } finally {
    database.close();
  }
}

function nextRecoveryPath(activeDatabasePath: string): string {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  return join(
    dirname(activeDatabasePath),
    `${basename(activeDatabasePath)}.pre-restore-${stamp}-${crypto.randomUUID()}`,
  );
}

function moveSidecarIfPresent(source: string, destination: string): void {
  if (existsSync(source)) renameSync(source, destination);
}

function displaceActiveDatabase(activeDatabasePath: string, recoveryPath: string): void {
  renameSync(activeDatabasePath, recoveryPath);
  try {
    moveSidecarIfPresent(`${activeDatabasePath}-wal`, `${recoveryPath}-wal`);
    moveSidecarIfPresent(`${activeDatabasePath}-shm`, `${recoveryPath}-shm`);
  } catch (error) {
    restoreRecoveryDatabase(activeDatabasePath, recoveryPath);
    throw error;
  }
}

function restoreRecoveryDatabase(activeDatabasePath: string, recoveryPath: string): void {
  removeDatabaseFiles(activeDatabasePath);
  renameSync(recoveryPath, activeDatabasePath);
  moveSidecarIfPresent(`${recoveryPath}-wal`, `${activeDatabasePath}-wal`);
  moveSidecarIfPresent(`${recoveryPath}-shm`, `${activeDatabasePath}-shm`);
}

function removeDatabaseFiles(databasePath: string): void {
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
}

function sha256FileSync(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
