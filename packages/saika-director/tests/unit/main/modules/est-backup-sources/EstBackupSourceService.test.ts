import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { migration082EstBackupSources } from '@/main/infrastructure/database/migrations/082_est_backup_sources';
import { EstBackupSourceService, SqliteEstBackupSourceRepository } from '@/main/modules/est-backup-sources';
import {
  CanonicalCsvEstBackupRecordParser,
  EstBackupRecordImportService,
  EstBackupRecordParserRegistry,
  EstBackupVerificationService,
} from '@/main/modules/est-backup-verification';

const eventId = '11111111-1111-4111-8111-111111111111';
const otherEvent = '22222222-2222-4222-8222-222222222222';
let db: Database.Database;
function setup() {
  const content = '\uFEFFkey,rank,totalScore\n001,1,630.1\n002,2,620.5';
  const file = {
    fileName: 'memory.csv',
    content,
    sizeBytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  const repository = new SqliteEstBackupSourceRepository(db);
  const sources = new EstBackupSourceService(repository, (id) => id === eventId);
  const imports = new EstBackupRecordImportService(
    { chooseSource: async () => file },
    new EstBackupRecordParserRegistry([new CanonicalCsvEstBackupRecordParser()]),
    sources,
  );
  return { file, sources, imports, repository };
}
describe('retained EST backup sources', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE est_backup_verification_runs (id TEXT PRIMARY KEY)');
    migration082EstBackupSources.up(db);
  });
  afterEach(() => db.close());
  it('retains the exact UTF-8 source and all parsed records without requiring competition results', async () => {
    const h = setup();
    const receipt = await h.imports.importRecords(undefined, eventId);
    if (receipt.status !== 'IMPORTED' || !receipt.sourceId) throw new Error('Missing retained source');
    const reopened = new EstBackupSourceService(new SqliteEstBackupSourceRepository(db), () => true);
    expect(reopened.get(receipt.sourceId)).toMatchObject({
      content: h.file.content,
      sha256: h.file.sha256,
      records: [
        { key: '001', rank: 1, totalScore: 630.1 },
        { key: '002', rank: 2, totalScore: 620.5 },
      ],
    });
    expect(reopened.list(eventId)[0]).toMatchObject({ id: receipt.sourceId, recordCount: 2 });
    expect(reopened.list(eventId)[0]).not.toHaveProperty('content');
    expect(reopened.list(otherEvent)).toEqual([]);
    expect(() => db.exec("UPDATE est_backup_sources SET payload_json = '{}'")).toThrow('append-only');
    expect(() => db.exec('DELETE FROM est_backup_sources')).toThrow('append-only');
  });
  it('rejects missing events, changed original bytes and corrupt evidence on read', async () => {
    const h = setup();
    await expect(h.imports.importRecords(undefined, otherEvent)).rejects.toThrow('existing event');
    expect(h.sources.list(eventId)).toEqual([]);
    const receipt = await h.imports.importRecords();
    if (receipt.status !== 'IMPORTED') throw new Error('Missing source');
    expect(() => h.sources.retain(eventId, h.file.content + '\n', receipt)).toThrow('integrity');
    const source = h.sources.retain(eventId, h.file.content, receipt);
    const corrupt = new EstBackupSourceService(
      {
        ...h.repository,
        append: vi.fn(),
        list: vi.fn(),
        find: () => ({ ...source, records: [{ key: '001', totalScore: 999 }] }),
      },
      () => true,
    );
    expect(() => corrupt.get(source.id)).toThrow('integrity');
  });
  it('binds comparisons to this event and unchanged parsed records, while manual comparisons remain available', async () => {
    const h = setup();
    const receipt = await h.imports.importRecords(undefined, eventId);
    if (receipt.status !== 'IMPORTED' || !receipt.sourceId) throw new Error('Missing retained source');
    const append = vi.fn();
    const service = new EstBackupVerificationService(
      { append, findByEvent: () => [] },
      { findByEventId: () => [] },
      { getByEvent: async () => [], getByRelay: async () => [] },
      { getQualification: async () => [] },
      undefined,
      h.sources,
    );
    const request = {
      eventId,
      resultKind: 'INDIVIDUAL' as const,
      keyType: 'START_NUMBER' as const,
      sourceId: receipt.sourceId,
      sourceName: 'Target memory',
      sourceReference: receipt.sourceReference,
      records: receipt.records,
      officialName: 'Jury',
    };
    await expect(service.verify({ ...request, eventId: otherEvent })).rejects.toThrow('no longer matches');
    await expect(service.verify({ ...request, records: [{ key: '001', totalScore: 630.2 }] })).rejects.toThrow(
      'no longer matches',
    );
    expect(append).not.toHaveBeenCalled();
    const run = await service.verify(request);
    expect(run.sourceId).toBe(receipt.sourceId);
    expect(run.verified).toBe(false);
    await service.verify({
      ...request,
      sourceId: undefined,
      sourceReference: 'Manual source',
      records: [{ key: '001', totalScore: 600 }],
    });
    expect(append).toHaveBeenCalledTimes(2);
  });
});
