import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migration089EvidenceFileContents } from '@/main/infrastructure/database/migrations/089_evidence_file_contents';
import { EvidenceFileService } from '@/main/modules/evidence-files/application/EvidenceFileService';
import { SqliteEvidenceFileStore } from '@/main/modules/evidence-files/infra/SqliteEvidenceFileStore';
import { EvidenceFileArchiveSource } from '@/main/modules/evidence-files/infra/EvidenceFileArchiveSource';
import type {
  EvidenceFile,
  IEvidenceFileRepository,
  IEvidenceFileTransfer,
} from '@/main/modules/evidence-files/domain/EvidenceFile';
import {
  CompetitionEvidenceBundleBuilder,
  serializeEvidenceBundle,
} from '@/main/modules/operational-archives/domain/CompetitionEvidenceBundle';

class MemoryRepository implements IEvidenceFileRepository {
  files: EvidenceFile[] = [];
  find(id: string) {
    return this.files.find((file) => file.id === id) ?? null;
  }
  list(evidenceId: string) {
    return this.files.filter((file) => file.evidenceId === evidenceId);
  }
  append(file: EvidenceFile) {
    if (this.find(file.id)) throw new Error('Duplicate ID');
    this.files.push(file);
  }
}

describe('Evidence file custody and portable archive', () => {
  let directory: string;
  const databases: Database.Database[] = [];
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-evidence-'));
  });
  afterEach(async () => {
    for (const database of databases.splice(0)) database.close();
    await rm(directory, { recursive: true, force: true });
  });

  function fixture() {
    const repository = new MemoryRepository();
    const database = new Database(':memory:');
    databases.push(database);
    migration089EvidenceFileContents.up(database);
    const store = new SqliteEvidenceFileStore(database, 1024);
    const transfer = {
      chooseSource: vi.fn(async () => ({ fileName: 'log.bin', bytes: new Uint8Array([0, 255, 13, 10, 128]) })),
      saveCopy: vi.fn(async () => true),
    };
    const subjects = { assertAttachable: vi.fn(() => ({ expectedSha256: null as string | null })) };
    const service = new EvidenceFileService(repository, store, transfer, subjects);
    const input = {
      id: crypto.randomUUID(),
      caseId: 'case',
      evidenceId: 'evidence',
      importedBy: 'Jury',
      statement: 'Adjacent Lane 3, series 2, top marked',
    };
    return { repository, database, store, transfer, subjects, service, input };
  }

  it('retains exact original bytes after the source is removed and exports them in a scoped bundle', async () => {
    const f = fixture();
    const original = join(directory, 'external.log');
    const bytes = new Uint8Array([0, 255, 13, 10, 128]);
    await writeFile(original, bytes);
    f.transfer.chooseSource.mockImplementation(async () => ({
      fileName: 'external.log',
      bytes: await readFile(original),
    }));
    const file = (await f.service.importFile(f.input))!;
    await rm(original);
    await f.service.exportFile(file.id);
    expect(f.transfer.saveCopy).toHaveBeenCalledWith('external.log', Buffer.from(bytes));
    const archive = new EvidenceFileArchiveSource(f.repository, f.store);
    expect((await archive.collect([]))[0]?.records).toEqual([]);
    const sections = [{ id: 'target-examination-evidence', records: [{ id: 'evidence' }] }];
    const attachments = await archive.collect(sections);
    const bundle = new CompetitionEvidenceBundleBuilder('test').build(
      {
        getChampionship: () => ({ id: 'championship', name: 'Test', date: '2026-09-07', venue: 'Range' }),
        collect: () => [...sections, ...attachments],
      },
      'championship',
    );
    const decoded = JSON.parse(serializeEvidenceBundle(bundle));
    const record = decoded.sections.find((section: { id: string }) => section.id === 'evidence-file-attachments')
      .records[0];
    expect(new Uint8Array(Buffer.from(record.contentBase64, 'base64'))).toEqual(bytes);
    expect(record.statement).toBe(f.input.statement);
    expect(record.sha256).toBe(file.sha256);
    const bundlePath = join(directory, 'bundle.json');
    const extracted = join(directory, 'extracted');
    await writeFile(bundlePath, serializeEvidenceBundle(bundle));
    execFileSync(process.execPath, ['../../scripts/extract-evidence-files.mjs', bundlePath, extracted]);
    const manifest = JSON.parse(await readFile(join(extracted, 'manifest.json'), 'utf8'));
    expect(new Uint8Array(await readFile(join(extracted, manifest.files[0].outputName)))).toEqual(bytes);
    expect(() =>
      execFileSync(process.execPath, ['../../scripts/extract-evidence-files.mjs', bundlePath, extracted], {
        stdio: 'pipe',
      }),
    ).toThrow();
  });

  it('replays an import ID without another dialog and rejects changes to its evidence association', async () => {
    const f = fixture();
    const file = await f.service.importFile(f.input);
    expect(await f.service.importFile(f.input)).toEqual(file);
    expect(f.transfer.chooseSource).toHaveBeenCalledTimes(1);
    expect(f.repository.files).toHaveLength(1);
    await expect(f.service.importFile({ ...f.input, evidenceId: 'other' })).rejects.toThrow('different evidence');
  });

  it('detects corruption and missing files before saving or publishing an archive', async () => {
    const f = fixture();
    const file = (await f.service.importFile(f.input))!;
    f.database.exec('DROP TRIGGER evidence_file_contents_no_update; DROP TRIGGER evidence_file_contents_no_delete');
    f.database
      .prepare('UPDATE evidence_file_contents SET content = ? WHERE sha256 = ?')
      .run(Buffer.from([1, 1, 1, 1, 1]), file.sha256);
    await expect(f.store.put(new Uint8Array([0, 255, 13, 10, 128]))).rejects.toThrow('SHA-256 mismatch');
    await expect(f.service.exportFile(file.id)).rejects.toThrow('SHA-256 mismatch');
    expect(f.transfer.saveCopy).not.toHaveBeenCalled();
    await expect(
      new EvidenceFileArchiveSource(f.repository, f.store).collect([
        { id: 'target-examination-evidence', records: [{ id: 'evidence' }] },
      ]),
    ).rejects.toThrow('SHA-256');
    f.database.prepare('DELETE FROM evidence_file_contents WHERE sha256 = ?').run(file.sha256);
    await expect(f.service.exportFile(file.id)).rejects.toThrow();
  });

  it('does not overwrite identical content and enforces size and storage-key boundaries', async () => {
    const f = fixture();
    const bytes = new Uint8Array([1, 2, 3]);
    const [first, second] = await Promise.all([f.store.put(bytes), f.store.put(bytes)]);
    expect(first).toEqual(second);
    expect(f.database.prepare('SELECT COUNT(*) FROM evidence_file_contents').pluck().get()).toBe(1);
    expect(() => f.database.prepare('DELETE FROM evidence_file_contents').run()).toThrow('append-only');
    expect(() => f.database.prepare('UPDATE evidence_file_contents SET content = ?').run(Buffer.from([0]))).toThrow(
      'append-only',
    );
    expect(Buffer.from(await f.store.readVerified(first.sha256, 3))).toEqual(Buffer.from(bytes));
    await expect(f.store.put(new Uint8Array(1025))).rejects.toThrow('exceeds');
    await expect(f.store.readVerified('../external.log', 1)).rejects.toThrow('content key');
    await expect(f.store.readVerified(first.sha256, 4)).rejects.toThrow('size');
  });

  it('rejects a recorded hash mismatch or an examination closed while the file picker was open', async () => {
    const f = fixture();
    f.subjects.assertAttachable.mockReturnValue({ expectedSha256: '0'.repeat(64) });
    await expect(f.service.importFile(f.input)).rejects.toThrow('recorded evidence SHA-256');
    expect(f.repository.files).toHaveLength(0);
    f.subjects.assertAttachable
      .mockReset()
      .mockReturnValueOnce({ expectedSha256: null })
      .mockImplementation(() => {
        throw new Error('Reopen examination');
      });
    await expect(f.service.importFile({ ...f.input, id: crypto.randomUUID() })).rejects.toThrow('Reopen');
    expect(f.repository.files).toHaveLength(0);
  });

  it('leaves no custody record on cancellation and refuses an oversized bundle without omitting evidence', async () => {
    const f = fixture();
    const transfer: IEvidenceFileTransfer = { ...f.transfer, chooseSource: async () => null };
    expect(await new EvidenceFileService(f.repository, f.store, transfer, f.subjects).importFile(f.input)).toBeNull();
    expect(f.repository.files).toHaveLength(0);
    await f.service.importFile(f.input);
    await expect(
      new EvidenceFileArchiveSource(f.repository, f.store, 1).collect([
        { id: 'target-examination-evidence', records: [{ id: 'evidence' }] },
      ]),
    ).rejects.toThrow('size limit');
  });
});
