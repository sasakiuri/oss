// SPDX-License-Identifier: MIT
/**
 * Backup inspection and startup restore read the same database facts (integrity check, schema version) but
 * judge them differently and report their own messages.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyPendingDatabaseRestoreSync,
  PENDING_RESTORE_DATABASE,
  PENDING_RESTORE_MARKER,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives';

let directory: string;
const databases: Database.Database[] = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'saika-inspection-'));
});
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await rm(directory, { recursive: true, force: true });
});

const INDEX_MARKER = 'index-marker-one';

/** Writes a closed database file; `corruptIndex` breaks one index entry so the integrity check fails. */
function writeDatabase(path: string, schemaVersion: string | null, options: { corruptIndex?: boolean } = {}): void {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE championships (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO championships (id, name) VALUES ('championship-1', 'Candidate championship');
    CREATE TABLE notes (text TEXT);
    CREATE INDEX notes_text ON notes (text);
  `);
  if (schemaVersion !== null) {
    database.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)").run(schemaVersion);
  }
  database.prepare('INSERT INTO notes (text) VALUES (?)').run(INDEX_MARKER);
  database.close();
  if (!options.corruptIndex) return;
  const bytes = readFileSync(path);
  const marker = Buffer.from(INDEX_MARKER);
  const indexEntry = bytes.indexOf(marker, bytes.indexOf(marker) + 1);
  bytes[indexEntry + marker.length - 1] = 'z'.charCodeAt(0);
  writeFileSync(path, bytes);
}

function gateway(): SqliteDatabaseBackupGateway {
  const activePath = join(directory, 'saika.db');
  writeDatabase(activePath, '41');
  const database = new Database(activePath);
  databases.push(database);
  return new SqliteDatabaseBackupGateway(database, activePath, directory, 41);
}

/** Stages `path` as the pending restore with a marker that matches its current bytes. */
function stage(path: string, schemaVersion: number): void {
  const bytes = readFileSync(path);
  writeFileSync(join(directory, PENDING_RESTORE_DATABASE), bytes);
  writeFileSync(
    join(directory, PENDING_RESTORE_MARKER),
    `${JSON.stringify({
      sourceFileName: 'candidate.db',
      stagedSha256: createHash('sha256').update(bytes).digest('hex'),
      schemaVersion,
      stagedAt: '2026-09-02T06:00:00.000Z',
      recoveryCopyWillBeCreated: true,
      pendingFileName: PENDING_RESTORE_DATABASE,
    })}\n`,
  );
}

describe('backup inspection', () => {
  it('reports a failed integrity check as a fact instead of an error', async () => {
    const candidate = join(directory, 'candidate.db');
    writeDatabase(candidate, '41', { corruptIndex: true });

    const inspection = await gateway().inspect(candidate);

    expect(inspection).toMatchObject({ integrityOk: false, schemaVersion: 41, championshipCount: 1 });
  });

  it.each([
    ['a missing version row', null],
    ['a version with a leading zero', '041'],
    ['a non-numeric version', 'v41'],
  ])('rejects %s', async (_case, version) => {
    const candidate = join(directory, 'candidate.db');
    writeDatabase(candidate, version);

    await expect(gateway().inspect(candidate)).rejects.toThrow(
      new Error('The selected file has no valid Saika schema version'),
    );
  });
});

describe('startup restore checks', () => {
  function apply() {
    return applyPendingDatabaseRestoreSync(join(directory, 'saika.db'), directory);
  }

  it('refuses a staged database that fails its integrity check', () => {
    const candidate = join(directory, 'candidate.db');
    writeDatabase(candidate, '41', { corruptIndex: true });
    stage(candidate, 41);

    expect(apply()).toEqual({ applied: false, error: 'The staged database failed its startup integrity check' });
    expect(existsSync(join(directory, PENDING_RESTORE_MARKER))).toBe(true);
  });

  it.each([
    ['a different version', '42'],
    ['a missing version row', null],
  ])('refuses a staged database with %s', (_case, version) => {
    const candidate = join(directory, 'candidate.db');
    writeDatabase(candidate, version);
    stage(candidate, 41);

    expect(apply()).toEqual({
      applied: false,
      error: 'The staged database schema changed after it was selected',
    });
  });

  it('accepts a staged version that equals the marker numerically', () => {
    const candidate = join(directory, 'candidate.db');
    writeDatabase(candidate, '041');
    stage(candidate, 41);

    expect(apply()).toMatchObject({ applied: true, sourceFileName: 'candidate.db' });
  });
});
