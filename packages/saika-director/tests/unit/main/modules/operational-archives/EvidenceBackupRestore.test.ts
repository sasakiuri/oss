import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { migration066EvidenceFiles } from '@/main/infrastructure/database/migrations/066_evidence_files';
import { migration089EvidenceFileContents } from '@/main/infrastructure/database/migrations/089_evidence_file_contents';
import {
  EvidenceFileArchiveSource,
  EvidenceFileService,
  SqliteEvidenceFileRepository,
  SqliteEvidenceFileStore,
} from '@/main/modules/evidence-files';
import {
  applyPendingDatabaseRestoreSync,
  PENDING_RESTORE_DATABASE,
  PENDING_RESTORE_MARKER,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives';

describe('Database backups retain evidence originals', { timeout: 30_000 }, () => {
  let directory: string;
  const databases: Database.Database[] = [];
  afterEach(async () => {
    for (const database of databases.splice(0)) if (database.open) database.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  function database(path: string, name: string, schemaVersion = 89) {
    const db = new Database(path);
    databases.push(db);
    db.exec(`CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE championships (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE target_examination_evidence (id TEXT PRIMARY KEY);
      INSERT INTO target_examination_evidence VALUES ('evidence');`);
    db.prepare('INSERT INTO schema_meta VALUES (?, ?)').run('version', String(schemaVersion));
    db.prepare('INSERT INTO championships VALUES (?, ?)').run('championship', name);
    migration066EvidenceFiles.up(db);
    if (schemaVersion >= 89) migration089EvidenceFileContents.up(db);
    return db;
  }

  async function evidence(db: Database.Database, bytes: Buffer) {
    const store = new SqliteEvidenceFileStore(db);
    const content = await store.put(bytes);
    const file = {
      id: 'file',
      caseId: 'case',
      evidenceId: 'evidence',
      fileName: 'original.bin',
      ...content,
      importedBy: 'Jury',
      importedAt: '2026-09-12T00:00:00.000Z',
      statement: 'Original examination record',
    };
    new SqliteEvidenceFileRepository(db).append(file);
    return file;
  }

  it('restores only the backup file on another PC and keeps both restored and recovery originals readable', async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-original-backup-'));
    const sourcePath = join(directory, 'source.db');
    const source = database(sourcePath, 'Backed up');
    const bytes = Buffer.from([0, 255, 13, 10, 128]);
    const file = await evidence(source, bytes);
    const backupPath = join(directory, 'portable.db');
    const backupGateway = new SqliteDatabaseBackupGateway(source, sourcePath, directory, 89);
    expect(await backupGateway.create(backupPath)).toMatchObject({ integrityOk: true, schemaVersion: 89 });
    source.close();
    await rm(sourcePath);

    const otherPC = join(directory, 'other-pc');
    await mkdir(otherPC);
    const activePath = join(otherPC, 'saika.db');
    const active = database(activePath, 'Before restore');
    const priorBytes = Buffer.from('Existing evidence on destination');
    const priorFile = await evidence(active, priorBytes);
    const copiedBackup = join(otherPC, 'portable.db');
    await copyFile(backupPath, copiedBackup);
    const restoreGateway = new SqliteDatabaseBackupGateway(active, activePath, otherPC, 89);
    const candidate = await restoreGateway.inspect(copiedBackup);
    await restoreGateway.stageRestore(copiedBackup, candidate.sha256);
    active.close();
    const result = applyPendingDatabaseRestoreSync(activePath, otherPC);
    expect(result.applied).toBe(true);
    expect(existsSync(join(otherPC, 'evidence-files'))).toBe(false);

    const restored = new Database(activePath);
    databases.push(restored);
    const store = new SqliteEvidenceFileStore(restored);
    const repository = new SqliteEvidenceFileRepository(restored);
    expect(repository.find(file.id)).toEqual(file);
    const transfer = { chooseSource: async () => null, saveCopy: vi.fn(async () => true) };
    const service = new EvidenceFileService(repository, store, transfer, {
      assertAttachable: () => ({ expectedSha256: null }),
    });
    expect(await service.exportFile(file.id)).toEqual({ saved: true });
    expect(transfer.saveCopy).toHaveBeenCalledWith(file.fileName, bytes);
    const sections = await new EvidenceFileArchiveSource(repository, store).collect([
      { id: 'target-examination-evidence', records: [{ id: 'evidence' }] },
    ]);
    expect(sections[0]!.records[0]!.contentBase64).toBe(bytes.toString('base64'));
    const recovery = new Database(result.recoveryPath!);
    databases.push(recovery);
    expect(await new SqliteEvidenceFileStore(recovery).readVerified(priorFile.sha256, priorFile.sizeBytes)).toEqual(
      priorBytes,
    );
  });

  it('rejects an old backup with only custody metadata before staging, even when local original files exist', async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-old-backup-'));
    const activePath = join(directory, 'saika.db');
    const active = database(activePath, 'Current');
    const oldPath = join(directory, 'old.db');
    const old = database(oldPath, 'Old', 88);
    const bytes = Buffer.from('Old original');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    old
      .prepare('INSERT INTO evidence_files VALUES (?, ?, ?)')
      .run('file', 'evidence', JSON.stringify({ sha256, sizeBytes: bytes.length }));
    old.close();
    await mkdir(join(directory, 'evidence-files'));
    writeFileSync(join(directory, 'evidence-files', `${sha256}.bin`), bytes);
    const gateway = new SqliteDatabaseBackupGateway(active, activePath, directory, 89);
    await expect(gateway.inspect(oldPath)).rejects.toThrow('does not contain its evidence originals');
    await expect(gateway.stageRestore(oldPath, '0'.repeat(64))).rejects.toThrow(
      'does not contain its evidence originals',
    );
    expect(existsSync(join(directory, PENDING_RESTORE_MARKER))).toBe(false);
    expect(active.prepare('SELECT name FROM championships').pluck().get()).toBe('Current');
  });

  it.each(['missing', 'corrupt'] as const)(
    'rejects %s content before completing a backup or replacing an existing database',
    async (failure) => {
      directory = await mkdtemp(join(tmpdir(), 'saika-invalid-original-'));
      const activePath = join(directory, 'saika.db');
      const active = database(activePath, 'Current');
      const bytes = Buffer.from('Original bytes');
      await evidence(active, bytes);
      const gateway = new SqliteDatabaseBackupGateway(active, activePath, directory, 89);
      const backupPath = join(directory, 'backup.db');
      const candidate = await gateway.create(backupPath);
      await gateway.stageRestore(backupPath, candidate.sha256);
      const stagedPath = join(directory, PENDING_RESTORE_DATABASE);
      const staged = new Database(stagedPath);
      corrupt(staged, failure);
      staged.close();
      // A matching outer digest must not make an internally incomplete backup acceptable.
      const markerPath = join(directory, PENDING_RESTORE_MARKER);
      const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
      marker.stagedSha256 = createHash('sha256').update(readFileSync(stagedPath)).digest('hex');
      writeFileSync(markerPath, JSON.stringify(marker));
      const expectedError = failure === 'missing' ? 'Evidence original is missing' : 'SHA-256 mismatch';
      expect(applyPendingDatabaseRestoreSync(activePath, directory)).toMatchObject({
        applied: false,
        error: expect.stringContaining(expectedError),
      });
      expect(active.prepare('SELECT name FROM championships').pluck().get()).toBe('Current');
      corrupt(active, failure);
      await expect(gateway.create(backupPath)).rejects.toThrow(expectedError);
      expect((await gateway.inspect(backupPath)).sha256).toBe(candidate.sha256);
    },
  );
});

function corrupt(db: Database.Database, failure: 'missing' | 'corrupt') {
  db.exec('DROP TRIGGER evidence_file_contents_no_update; DROP TRIGGER evidence_file_contents_no_delete');
  if (failure === 'missing') db.exec('DELETE FROM evidence_file_contents');
  else db.prepare('UPDATE evidence_file_contents SET content = ?').run(Buffer.from('Modified bytes'));
}
