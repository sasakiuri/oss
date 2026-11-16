// SPDX-License-Identifier: MIT
/**
 * The three atomic writers move a fully written temporary file over the destination, keep the previous file
 * until the move succeeds, and differ only in how the temporary file is written.
 */
import Database from 'better-sqlite3';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronArchiveFileGateway } from '@/main/modules/operational-archives/infra/ElectronArchiveFileGateway';
import {
  PENDING_RESTORE_DATABASE,
  PENDING_RESTORE_MARKER,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives/infra/SqliteDatabaseBackupGateway';
import { writeFileAtomic } from '@/main/shared-infra/files/writeFileAtomic';

const failures = vi.hoisted(() => ({
  rename: null as ((from: string, to: string) => Error | null) | null,
  unlink: null as ((path: string) => Error | null) | null,
}));

vi.mock('electron', () => ({ dialog: {} }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(async (from: string, to: string) => {
      const failure = failures.rename?.(String(from), String(to));
      if (failure) throw failure;
      return actual.rename(from, to);
    }),
    unlink: vi.fn(async (path: string) => {
      const failure = failures.unlink?.(String(path));
      if (failure) throw failure;
      return actual.unlink(path);
    }),
  };
});

let directory: string;
const databases: Database.Database[] = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'saika-atomic-'));
});
afterEach(async () => {
  failures.rename = null;
  failures.unlink = null;
  for (const database of databases.splice(0)) database.close();
  await rm(directory, { recursive: true, force: true });
});

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

/** Fails the move of the written temporary file onto the destination. */
function failFinalMove(): Error {
  const error = errorWithCode('EBUSY');
  failures.rename = (from) => (from.includes('.partial-') ? error : null);
  return error;
}

/** Fails moving the current destination aside with an error other than "missing". */
function failDisplacement(): Error {
  const error = errorWithCode('EACCES');
  failures.rename = (_from, to) => (to.includes('.previous-') ? error : null);
  return error;
}

function failDisplacedCleanup(): void {
  failures.unlink = (path) => (path.includes('.previous-') ? errorWithCode('EPERM') : null);
}

async function entries(): Promise<string[]> {
  return (await readdir(directory)).sort();
}

const writers = [
  {
    name: 'writeFileAtomic',
    write: (destination: string, content: string) => writeFileAtomic(destination, content),
    mode: 0o600,
  },
  {
    name: 'ElectronArchiveFileGateway.writeUtf8Atomic',
    write: (destination: string, content: string) =>
      new ElectronArchiveFileGateway().writeUtf8Atomic(destination, content),
    mode: 0o666 & ~process.umask(),
  },
];

describe.each(writers)('$name', ({ write, mode }) => {
  it('writes a new file and leaves no temporary files', async () => {
    const destination = join(directory, 'output.json');

    await write(destination, '{"value":"Zoë"}\n');

    expect(await readFile(destination, 'utf8')).toBe('{"value":"Zoë"}\n');
    expect(await entries()).toEqual(['output.json']);
  });

  it.skipIf(process.platform === 'win32')('creates the file with its caller-specific permissions', async () => {
    const destination = join(directory, 'output.json');

    await write(destination, 'content');

    expect((await stat(destination)).mode & 0o777).toBe(mode);
  });

  it('replaces an existing file and removes the displaced copy', async () => {
    const destination = join(directory, 'output.json');
    await writeFile(destination, 'previous');

    await write(destination, 'next');

    expect(await readFile(destination, 'utf8')).toBe('next');
    expect(await entries()).toEqual(['output.json']);
  });

  it('restores the previous file and removes the temporary file when the final move fails', async () => {
    const destination = join(directory, 'output.json');
    await writeFile(destination, 'previous');
    const error = failFinalMove();

    await expect(write(destination, 'next')).rejects.toBe(error);

    expect(await readFile(destination, 'utf8')).toBe('previous');
    expect(await entries()).toEqual(['output.json']);
  });

  it('keeps the destination untouched when it cannot be moved aside', async () => {
    const destination = join(directory, 'output.json');
    await writeFile(destination, 'previous');
    const error = failDisplacement();

    await expect(write(destination, 'next')).rejects.toBe(error);

    expect(await readFile(destination, 'utf8')).toBe('previous');
    expect(await entries()).toEqual(['output.json']);
  });

  it('reports success and keeps the displaced copy when only its cleanup fails', async () => {
    const destination = join(directory, 'output.json');
    await writeFile(destination, 'previous');
    failDisplacedCleanup();

    await write(destination, 'next');

    expect(await readFile(destination, 'utf8')).toBe('next');
    const remaining = await entries();
    expect(remaining).toHaveLength(2);
    expect(remaining[0]).toBe('output.json');
    expect(remaining[1]).toMatch(/^output\.json\.previous-[0-9a-f-]{36}$/);
    expect(await readFile(join(directory, remaining[1]!), 'utf8')).toBe('previous');
  });

  it('refuses to reuse an existing temporary path', async () => {
    const destination = join(directory, 'output.json');
    const uuid = '00000000-0000-4000-8000-000000000000';
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid);
    await writeFile(`${destination}.partial-${uuid}`, 'someone else');

    try {
      await expect(write(destination, 'next')).rejects.toMatchObject({ code: 'EEXIST' });
    } finally {
      randomUUID.mockRestore();
    }
  });
});

describe('SqliteDatabaseBackupGateway file replacement', () => {
  function gateway() {
    const activePath = join(directory, 'saika.db');
    const database = new Database(activePath);
    databases.push(database);
    database.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta (key, value) VALUES ('version', '41');
      CREATE TABLE championships (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO championships (id, name) VALUES ('championship-1', 'Current championship');
    `);
    return new SqliteDatabaseBackupGateway(
      database,
      activePath,
      directory,
      41,
      () => new Date('2026-09-02T06:00:00.000Z'),
    );
  }

  function championshipName(path: string): unknown {
    const database = new Database(path, { readonly: true });
    try {
      return database.prepare('SELECT name FROM championships').pluck().get();
    } finally {
      database.close();
    }
  }

  it('replaces an existing backup destination and leaves no temporary files', async () => {
    const backupPath = join(directory, 'backup.db');
    await writeFile(backupPath, 'previous');

    await gateway().create(backupPath);

    expect(championshipName(backupPath)).toBe('Current championship');
    expect(await entries()).toEqual(['backup.db', 'saika.db']);
  });

  it('restores the previous backup file when the final move fails', async () => {
    const backupPath = join(directory, 'backup.db');
    await writeFile(backupPath, 'previous');
    const backups = gateway();
    const error = failFinalMove();

    await expect(backups.create(backupPath)).rejects.toBe(error);

    expect(await readFile(backupPath, 'utf8')).toBe('previous');
    expect(await entries()).toEqual(['backup.db', 'saika.db']);
  });

  it('stages a restore copy and writes the marker as one JSON line, replacing earlier staged files', async () => {
    const backups = gateway();
    const candidatePath = join(directory, 'candidate.db');
    await backups.create(candidatePath);
    await writeFile(join(directory, PENDING_RESTORE_DATABASE), 'stale database');
    await writeFile(join(directory, PENDING_RESTORE_MARKER), 'stale marker');
    const inspected = await backups.inspect(candidatePath);

    const marker = await backups.stageRestore(candidatePath, inspected.sha256);

    expect(await readFile(join(directory, PENDING_RESTORE_MARKER), 'utf8')).toBe(`${JSON.stringify(marker)}\n`);
    expect(championshipName(join(directory, PENDING_RESTORE_DATABASE))).toBe('Current championship');
    expect(await entries()).toEqual(
      ['candidate.db', PENDING_RESTORE_DATABASE, PENDING_RESTORE_MARKER, 'saika.db'].sort(),
    );
  });

  it.skipIf(process.platform === 'win32')('creates the marker with default permissions', async () => {
    const backups = gateway();
    const candidatePath = join(directory, 'candidate.db');
    await backups.create(candidatePath);
    const inspected = await backups.inspect(candidatePath);

    await backups.stageRestore(candidatePath, inspected.sha256);

    expect((await stat(join(directory, PENDING_RESTORE_MARKER))).mode & 0o777).toBe(0o666 & ~process.umask());
  });

  it('keeps the earlier marker when its final move fails', async () => {
    const backups = gateway();
    const candidatePath = join(directory, 'candidate.db');
    await backups.create(candidatePath);
    await writeFile(join(directory, PENDING_RESTORE_MARKER), 'earlier marker');
    const inspected = await backups.inspect(candidatePath);
    const error = errorWithCode('EBUSY');
    failures.rename = (from) => (from.includes(`${PENDING_RESTORE_MARKER}.partial-`) ? error : null);

    await expect(backups.stageRestore(candidatePath, inspected.sha256)).rejects.toBe(error);

    expect(await readFile(join(directory, PENDING_RESTORE_MARKER), 'utf8')).toBe('earlier marker');
    expect(await entries()).toEqual(
      ['candidate.db', PENDING_RESTORE_DATABASE, PENDING_RESTORE_MARKER, 'saika.db'].sort(),
    );
  });
});
