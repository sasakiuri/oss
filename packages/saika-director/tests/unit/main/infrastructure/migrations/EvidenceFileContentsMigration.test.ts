import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { allMigrations } from '@/main/infrastructure/database/migrations';
import { migration089EvidenceFileContents } from '@/main/infrastructure/database/migrations/089_evidence_file_contents';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { SqliteEvidenceFileStore } from '@/main/modules/evidence-files';

describe('Evidence original database migration', () => {
  let directory: string;
  let database: Database.Database | undefined;
  afterEach(async () => {
    database?.close();
    database = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function legacyDatabase() {
    directory = await mkdtemp(join(tmpdir(), 'saika-evidence-migration-'));
    database = new Database(join(directory, 'saika.db'));
    database.exec(`CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta VALUES ('version', '88');
      CREATE TABLE evidence_files (snapshot_json TEXT NOT NULL);`);
    await mkdir(join(directory, 'evidence-files'));
    return database;
  }

  async function addOriginal(db: Database.Database, bytes: Buffer) {
    const reference = { sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
    db.prepare('INSERT INTO evidence_files VALUES (?)').run(JSON.stringify(reference));
    const file = join(directory, 'evidence-files', `${reference.sha256}.bin`);
    await writeFile(file, bytes);
    return { ...reference, file };
  }

  it('imports existing binary originals once, retains source files, and can reopen without them', async () => {
    const db = await legacyDatabase();
    const bytes = Buffer.from([0, 255, 128, 13, 10]);
    const original = await addOriginal(db, bytes);
    await addOriginal(db, bytes);
    new MigrationRunner(db).run([migration089EvidenceFileContents]);
    expect(new MigrationRunner(db).getCurrentVersion()).toBe(89);
    expect(db.prepare('SELECT COUNT(*) FROM evidence_file_contents').pluck().get()).toBe(1);
    expect(await readFile(original.file)).toEqual(bytes);
    await rm(join(directory, 'evidence-files'), { recursive: true });
    db.close();
    database = undefined;
    const reopened = new DatabaseManager(join(directory, 'saika.db'));
    try {
      expect(
        await new SqliteEvidenceFileStore(reopened.getDatabase()).readVerified(original.sha256, bytes.length),
      ).toEqual(bytes);
    } finally {
      reopened.close();
    }
  });

  it.each(['missing', 'corrupt', 'wrong size'] as const)(
    'rolls back every imported original when a later file is %s',
    async (failure) => {
      const db = await legacyDatabase();
      const first = await addOriginal(db, Buffer.from([1, 2, 3]));
      const second = await addOriginal(db, Buffer.from([4, 5, 6]));
      if (failure === 'missing') await rm(second.file);
      else await writeFile(second.file, failure === 'corrupt' ? Buffer.from([4, 5, 0]) : Buffer.from([4]));
      const runner = new MigrationRunner(db);
      expect(() => runner.run([migration089EvidenceFileContents])).toThrow('Could not migrate evidence original');
      expect(runner.getCurrentVersion()).toBe(88);
      expect(db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'evidence_file_contents'").get()).toBeUndefined();
      expect(existsSync(first.file)).toBe(true);
      expect(db.prepare('SELECT COUNT(*) FROM evidence_files').pluck().get()).toBe(2);
      await writeFile(second.file, Buffer.from([4, 5, 6]));
      runner.run([migration089EvidenceFileContents]);
      expect(db.prepare('SELECT COUNT(*) FROM evidence_file_contents').pluck().get()).toBe(2);
    },
  );

  it('does not read a custody key outside the original directory', async () => {
    const db = await legacyDatabase();
    db.prepare('INSERT INTO evidence_files VALUES (?)').run(JSON.stringify({ sha256: '../other', sizeBytes: 0 }));
    expect(() => new MigrationRunner(db).run([migration089EvidenceFileContents])).toThrow(
      'Invalid evidence content key',
    );
    expect(new MigrationRunner(db).getCurrentVersion()).toBe(88);
  });

  it('rolls back the migration when SQLite cannot store the originals and allows retry', async () => {
    const db = await legacyDatabase();
    const original = await addOriginal(db, Buffer.alloc(256 * 1024, 7));
    const pages = db.pragma('page_count', { simple: true }) as number;
    db.pragma(`max_page_count = ${pages + 8}`);
    const runner = new MigrationRunner(db);
    expect(() => runner.run([migration089EvidenceFileContents])).toThrow('Could not migrate evidence original');
    expect(runner.getCurrentVersion()).toBe(88);
    expect(db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'evidence_file_contents'").get()).toBeUndefined();
    expect(existsSync(original.file)).toBe(true);
    db.pragma('max_page_count = 10000');
    runner.run([migration089EvidenceFileContents]);
    expect(runner.getCurrentVersion()).toBe(89);
  });

  it('creates the latest schema for an empty database without requiring an external directory', async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-evidence-fresh-'));
    database = new Database(join(directory, 'saika.db'));
    new MigrationRunner(database).run(allMigrations);
    expect(new MigrationRunner(database).getCurrentVersion()).toBe(89);
    expect(database.prepare('SELECT COUNT(*) FROM evidence_file_contents').pluck().get()).toBe(0);
  });
});
