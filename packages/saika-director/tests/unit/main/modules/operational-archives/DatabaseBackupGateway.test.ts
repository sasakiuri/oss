import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyPendingDatabaseRestoreSync,
  PENDING_RESTORE_DATABASE,
  PENDING_RESTORE_MARKER,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives';

describe('SqliteDatabaseBackupGateway', () => {
  let directory: string | undefined;
  let database: Database.Database | undefined;

  afterEach(async () => {
    database?.close();
    database = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('creates an integrity-checked backup and restores it on startup while retaining the current database', async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-archive-'));
    const activePath = join(directory, 'saika.db');
    const candidatePath = join(directory, 'candidate.db');
    const backupPath = join(directory, 'backup.db');

    database = createDatabase(activePath, 'Current championship');
    const gateway = new SqliteDatabaseBackupGateway(
      database,
      activePath,
      directory,
      41,
      () => new Date('2026-09-02T06:00:00.000Z'),
    );
    const backup = await gateway.create(backupPath);
    expect(backup).toMatchObject({ integrityOk: true, schemaVersion: 41, championshipCount: 1 });
    expect(backup.sha256).toMatch(/^[a-f0-9]{64}$/);

    const candidateDatabase = createDatabase(candidatePath, 'Restored championship');
    candidateDatabase.close();
    const candidate = await gateway.inspect(candidatePath);
    const pending = await gateway.stageRestore(candidatePath, candidate.sha256);
    expect(pending).toMatchObject({ sourceFileName: 'candidate.db', recoveryCopyWillBeCreated: true });

    database.close();
    database = undefined;
    const applied = applyPendingDatabaseRestoreSync(activePath, directory);
    expect(applied.applied).toBe(true);
    expect(applied.recoveryPath && existsSync(applied.recoveryPath)).toBe(true);

    const restored = new Database(activePath, { readonly: true });
    expect(restored.prepare('SELECT name FROM championships').pluck().get()).toBe('Restored championship');
    restored.close();
    const recovery = new Database(applied.recoveryPath!, { readonly: true });
    expect(recovery.prepare('SELECT name FROM championships').pluck().get()).toBe('Current championship');
    recovery.close();
  });

  it('rejects a candidate that changes after inspection', async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-archive-'));
    const activePath = join(directory, 'saika.db');
    const candidatePath = join(directory, 'candidate.db');
    database = createDatabase(activePath, 'Current championship');
    const candidateDatabase = createDatabase(candidatePath, 'Candidate championship');
    candidateDatabase.close();
    const gateway = new SqliteDatabaseBackupGateway(database, activePath, directory, 41);
    const inspected = await gateway.inspect(candidatePath);

    const changed = new Database(candidatePath);
    changed.prepare('UPDATE championships SET name = ?').run('Changed after inspection');
    changed.close();

    await expect(gateway.stageRestore(candidatePath, inspected.sha256)).rejects.toThrow('changed after inspection');
  });

  it('leaves the active database untouched when the staged restore is tampered with', async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-archive-'));
    const activePath = join(directory, 'saika.db');
    const candidatePath = join(directory, 'candidate.db');
    database = createDatabase(activePath, 'Current championship');
    const candidateDatabase = createDatabase(candidatePath, 'Candidate championship');
    candidateDatabase.close();
    const gateway = new SqliteDatabaseBackupGateway(database, activePath, directory, 41);
    const inspected = await gateway.inspect(candidatePath);
    await gateway.stageRestore(candidatePath, inspected.sha256);

    const staged = new Database(join(directory, PENDING_RESTORE_DATABASE));
    staged.prepare('UPDATE championships SET name = ?').run('Tampered championship');
    staged.close();
    database.close();
    database = undefined;

    const applied = applyPendingDatabaseRestoreSync(activePath, directory);

    expect(applied).toMatchObject({ applied: false, error: expect.stringContaining('digest') });
    expect(existsSync(join(directory, PENDING_RESTORE_MARKER))).toBe(true);
    const active = new Database(activePath, { readonly: true });
    expect(active.prepare('SELECT name FROM championships').pluck().get()).toBe('Current championship');
    active.close();
  });
});

function createDatabase(path: string, championshipName: string): Database.Database {
  const value = new Database(path);
  value.exec(`
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO schema_meta (key, value) VALUES ('version', '41');
    CREATE TABLE championships (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  `);
  value.prepare('INSERT INTO championships (id, name) VALUES (?, ?)').run(crypto.randomUUID(), championshipName);
  return value;
}
