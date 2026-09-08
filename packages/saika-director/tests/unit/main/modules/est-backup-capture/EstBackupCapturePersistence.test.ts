// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { migration083EstBackupCapturePlans } from '@/main/infrastructure/database/migrations/083_est_backup_capture_plans';
import {
  EstBackupCaptureService,
  type IEstBackupFeed,
  type IEstBackupSnapshotCapture,
} from '@/main/modules/est-backup-capture/EstBackupCaptureService';
import { EstBackupParserReferences } from '@/main/modules/est-backup-capture/EstBackupParserReferences';
import { SqliteEstBackupCapturePlanRepository } from '@/main/modules/est-backup-capture/SqliteEstBackupCapturePlanRepository';
import { ColumnMappedEstBackupRecordParser } from '@/main/modules/est-backup-verification/domain/ColumnMappedEstBackupRecordParser';

const eventId = '11111111-1111-4111-8111-111111111111';
let directory: string;
let db: Database.Database;
let plans: SqliteEstBackupCapturePlanRepository;
const services: EstBackupCaptureService[] = [];
const refs = new EstBackupParserReferences();
const parser = new ColumnMappedEstBackupRecordParser({
  delimiter: ';',
  decimalSeparator: ',',
  keyColumn: 'Bib',
  totalScoreColumn: 'Score',
  rankColumn: null,
});
const source = { fileName: 'scores.csv', content: 'Bib;Score\n101;600,5', sizeBytes: 19, sha256: 'digest' };
const feed: IEstBackupFeed = {
  label: 'scores.csv',
  reference: { adapter: 'TEST_FEED_V1', options: { path: '/independent/scores.csv' } },
  read: async () => source,
};

function create(exists: (id: string) => boolean = () => true) {
  const choose = vi.fn(async () => feed);
  const restoreFeed = vi.fn(async () => feed);
  const captureSource = vi.fn<IEstBackupSnapshotCapture['captureSource']>(() => ({ sourceId: 'retained-source' }));
  const service = new EstBackupCaptureService({ choose }, { captureSource }, exists, ['.csv'], undefined, undefined, {
    plans,
    restoreFeed,
    describeParser: (p) => refs.describe(p),
    restoreParser: (r) => refs.restore(r),
  });
  services.push(service);
  return { service, captureSource, restoreFeed, choose };
}

beforeEach(() => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), 'saika-capture-'));
  db = new Database(join(directory, 'settings.sqlite'));
  migration083EstBackupCapturePlans.up(db);
  plans = new SqliteEstBackupCapturePlanRepository(db);
});
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  db.close();
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('saved backup capture', () => {
  it('reopens the database and restores opted-in capture with its exact mapping and a fresh run', async () => {
    const first = create();
    const original = await first.service.start(eventId, 2000, parser, {
      snapshotMode: 'COMPLETE_FILES',
      resumeOnStartup: true,
    });
    first.service.dispose();
    db.close();
    db = new Database(join(directory, 'settings.sqlite'));
    plans = new SqliteEstBackupCapturePlanRepository(db);
    const next = create();
    expect(next.service.status(eventId)).toMatchObject({ state: 'STOPPED', checkedAt: null, canResume: true });
    await next.service.restoreSavedRuns();
    await vi.waitFor(() => expect(next.service.status(eventId).state).toBe('READY'));
    expect(next.choose).not.toHaveBeenCalled();
    expect(next.service.status(eventId)).toMatchObject({
      state: 'READY',
      intervalMilliseconds: 2000,
      resumeOnStartup: true,
    });
    expect(next.service.status(eventId).runId).not.toBe(original.runId);
    const restoredParser = next.captureSource.mock.calls[0]![2];
    expect(restoredParser!.parse(source.content)).toEqual([{ key: '101', totalScore: 600.5, rank: null }]);
  });

  it('keeps automatic restart opt-in and allows manual resumption without a file chooser', async () => {
    const first = create();
    await first.service.start(eventId, 1000);
    first.service.dispose();
    const next = create();
    await next.service.restoreSavedRuns();
    expect(next.restoreFeed).not.toHaveBeenCalled();
    await next.service.resume(eventId);
    expect(next.choose).not.toHaveBeenCalled();
    expect(next.service.status(eventId).state).toBe('WAITING');
  });

  it('starts other saved sources while one source is still waiting for its first read', async () => {
    const first = create();
    await first.service.start(eventId, 1000, undefined, { resumeOnStartup: true, snapshotMode: 'COMPLETE_FILES' });
    first.service.dispose();
    const otherEvent = '33333333-3333-4333-8333-333333333333';
    plans.save({ ...plans.find(eventId)!, eventId: otherEvent });
    const next = create();
    let finish!: (value: typeof source) => void;
    const pending = new Promise<typeof source>((resolve) => {
      finish = resolve;
    });
    next.restoreFeed.mockResolvedValueOnce({ ...feed, read: () => pending });
    await next.service.restoreSavedRuns();
    await vi.waitFor(() => expect(next.service.status(otherEvent).state).toBe('READY'));
    expect(next.service.status(eventId).state).toBe('READING');
    next.service.dispose();
    finish(source);
    await vi.waitFor(() => expect(next.service.status(eventId).state).toBe('STOPPED'));
    expect(next.captureSource).toHaveBeenCalledTimes(1);
  });

  it('persists an explicit stop so an opted-in source stays stopped after restart', async () => {
    const first = create();
    const run = await first.service.start(eventId, 1000, undefined, { resumeOnStartup: true });
    first.service.stop(eventId, run.runId!);
    first.service.dispose();
    const next = create();
    await next.service.restoreSavedRuns();
    expect(next.restoreFeed).not.toHaveBeenCalled();
    expect(plans.find(eventId)?.enabled).toBe(false);
    await next.service.resume(eventId);
    expect(plans.find(eventId)?.enabled).toBe(true);
  });

  it('keeps a failed restoration visible and permits forgetting its configuration', async () => {
    const first = create();
    await first.service.start(eventId, 1000, undefined, { resumeOnStartup: true });
    first.service.dispose();
    const next = create();
    next.restoreFeed.mockRejectedValue(new Error('Adapter unavailable'));
    await next.service.restoreSavedRuns();
    expect(next.service.status(eventId)).toMatchObject({
      state: 'ERROR',
      runId: null,
      canResume: true,
      error: 'Adapter unavailable',
    });
    expect(next.service.forgetSaved(eventId)).toMatchObject({ state: 'STOPPED', canResume: false });
    expect(next.captureSource).not.toHaveBeenCalled();
  });

  it('does not revive capture when a pending restore completes after the source was forgotten', async () => {
    const first = create();
    await first.service.start(eventId, 1000);
    first.service.dispose();
    const next = create();
    let finish!: (value: IEstBackupFeed) => void;
    next.restoreFeed.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const resumed = next.service.resume(eventId);
    next.service.forgetSaved(eventId);
    finish(feed);
    await resumed;
    expect(next.service.status(eventId)).toMatchObject({ state: 'STOPPED', canResume: false });
    expect(next.captureSource).not.toHaveBeenCalled();
  });

  it('removes deleted event plans without reading their source', async () => {
    const first = create();
    await first.service.start(eventId, 1000, undefined, { resumeOnStartup: true });
    first.service.dispose();
    const next = create(() => false);
    await next.service.restoreSavedRuns();
    expect(next.restoreFeed).not.toHaveBeenCalled();
    expect(plans.find(eventId)).toBeNull();
  });

  it('rejects unknown parser adapters rather than silently changing the source layout', async () => {
    const first = create();
    await first.service.start(eventId, 1000, parser, { resumeOnStartup: true });
    first.service.dispose();
    plans.save({ ...plans.find(eventId)!, parser: { adapter: 'UNKNOWN_V2', options: {} } });
    const next = create();
    await next.service.restoreSavedRuns();
    expect(next.service.status(eventId).error).toMatch(/parser is not supported/);
    expect(next.captureSource).not.toHaveBeenCalled();
  });
});
