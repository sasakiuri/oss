import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';

import { assertEvidenceFileContents } from '@/main/infrastructure/database/EvidenceFileContents';

import type {
  DatabaseBackupGateway,
  DatabaseBackupInspection,
  PendingDatabaseRestore,
} from '../application/OperationalArchivePorts';

export const PENDING_RESTORE_DATABASE = 'saika.restore-pending.db';
export const PENDING_RESTORE_MARKER = 'saika.restore-pending.json';

interface RestoreMarker extends PendingDatabaseRestore {
  readonly pendingFileName: typeof PENDING_RESTORE_DATABASE;
}

export class SqliteDatabaseBackupGateway implements DatabaseBackupGateway {
  constructor(
    private readonly database: BetterSqlite3.Database,
    private readonly activeDatabasePath: string,
    private readonly stagingDirectory: string,
    private readonly latestSupportedSchemaVersion: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(destination: string): Promise<DatabaseBackupInspection> {
    this.assertNotActiveDatabase(destination);
    const temporary = `${destination}.partial-${crypto.randomUUID()}`;
    try {
      await this.database.backup(temporary);
      const temporaryInspection = await this.inspect(temporary);
      if (!temporaryInspection.integrityOk) throw new Error('The created database backup failed its integrity check');
      await replaceFile(temporary, destination);
      return this.inspect(destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async inspect(source: string): Promise<DatabaseBackupInspection> {
    this.assertNotActiveDatabase(source);
    const sourcePath = resolve(source);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error('The selected backup is not a file');
    const candidate = new Database(sourcePath, { readonly: true, fileMustExist: true });
    let integrityOk = false;
    let schemaVersion = 0;
    let championshipCount = 0;
    try {
      const integrityRows = candidate.pragma('integrity_check') as Array<Record<string, unknown>>;
      integrityOk = integrityRows.length === 1 && Object.values(integrityRows[0] ?? {})[0] === 'ok';
      const schemaRow = candidate.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
        { value: string } | undefined;
      if (!schemaRow || !/^(0|[1-9]\d*)$/.test(schemaRow.value)) {
        throw new Error('The selected file has no valid Saika schema version');
      }
      schemaVersion = Number(schemaRow.value);
      const countRow = candidate.prepare('SELECT COUNT(*) AS count FROM championships').get() as { count: number };
      championshipCount = countRow.count;
      assertEvidenceFileContents(candidate);
    } finally {
      candidate.close();
    }
    return {
      path: sourcePath,
      fileName: basename(sourcePath),
      sizeBytes: sourceStat.size,
      sha256: await hashFile(sourcePath),
      schemaVersion,
      championshipCount,
      integrityOk,
      inspectedAt: this.now().toISOString(),
    };
  }

  compatibilityIssues(inspection: DatabaseBackupInspection): readonly string[] {
    const issues: string[] = [];
    if (!inspection.integrityOk) issues.push('SQLite integrity check failed');
    if (inspection.schemaVersion < 3) issues.push('Legacy schemas below version 3 cannot be restored');
    if (inspection.schemaVersion > this.latestSupportedSchemaVersion) {
      issues.push(
        `Backup schema ${inspection.schemaVersion} is newer than supported schema ${this.latestSupportedSchemaVersion}`,
      );
    }
    return issues;
  }

  async stageRestore(source: string, expectedSha256: string): Promise<PendingDatabaseRestore> {
    const inspection = await this.inspect(source);
    if (inspection.sha256 !== expectedSha256) throw new Error('The restore candidate changed after inspection');
    const issues = this.compatibilityIssues(inspection);
    if (issues.length > 0) throw new Error(`The restore candidate is incompatible: ${issues.join('; ')}`);

    const pendingPath = this.pendingDatabasePath();
    const temporary = `${pendingPath}.partial-${crypto.randomUUID()}`;
    try {
      await copyFile(inspection.path, temporary);
      if ((await hashFile(temporary)) !== inspection.sha256)
        throw new Error('The staged restore copy failed verification');
      await replaceFile(temporary, pendingPath);
      const marker: RestoreMarker = {
        sourceFileName: inspection.fileName,
        stagedSha256: inspection.sha256,
        schemaVersion: inspection.schemaVersion,
        stagedAt: this.now().toISOString(),
        recoveryCopyWillBeCreated: true,
        pendingFileName: PENDING_RESTORE_DATABASE,
      };
      await writeJsonAtomic(this.markerPath(), marker);
      return marker;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async getPendingRestore(): Promise<PendingDatabaseRestore | null> {
    let raw: string;
    try {
      raw = await readFile(this.markerPath(), 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return parseRestoreMarker(raw);
  }

  async cancelPendingRestore(): Promise<boolean> {
    const pending = await this.getPendingRestore();
    await Promise.all([
      unlink(this.markerPath()).catch(ignoreMissing),
      unlink(this.pendingDatabasePath()).catch(ignoreMissing),
    ]);
    return pending !== null;
  }

  private markerPath(): string {
    return join(this.stagingDirectory, PENDING_RESTORE_MARKER);
  }

  private pendingDatabasePath(): string {
    return join(this.stagingDirectory, PENDING_RESTORE_DATABASE);
  }

  private assertNotActiveDatabase(path: string): void {
    if (resolve(path) === resolve(this.activeDatabasePath)) {
      throw new Error('The active Director database cannot be used as a backup or restore candidate');
    }
  }
}

export function parseRestoreMarker(raw: string): RestoreMarker {
  const value = JSON.parse(raw) as Partial<RestoreMarker>;
  if (
    value.pendingFileName !== PENDING_RESTORE_DATABASE ||
    typeof value.sourceFileName !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.stagedSha256 ?? '') ||
    !Number.isInteger(value.schemaVersion) ||
    typeof value.stagedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.stagedAt)) ||
    value.recoveryCopyWillBeCreated !== true
  ) {
    throw new Error('The pending database restore marker is invalid');
  }
  return value as RestoreMarker;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.partial-${crypto.randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
    await replaceFile(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function ignoreMissing(error: unknown): void {
  if (!isMissing(error)) throw error;
}

async function replaceFile(source: string, destination: string): Promise<void> {
  const displaced = `${destination}.previous-${crypto.randomUUID()}`;
  let hadDestination = false;
  try {
    await rename(destination, displaced);
    hadDestination = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  try {
    await rename(source, destination);
  } catch (error) {
    if (hadDestination) await rename(displaced, destination).catch(() => undefined);
    throw error;
  }
  // The replacement is already committed. Keep an undeletable displaced file
  // as a recoverable artifact instead of reporting a false failure.
  if (hadDestination) await unlink(displaced).catch(() => undefined);
}
