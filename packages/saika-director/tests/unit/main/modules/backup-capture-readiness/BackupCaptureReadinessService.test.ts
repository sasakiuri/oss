// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { migration084BackupCaptureReadiness } from '@/main/infrastructure/database/migrations/084_backup_capture_readiness';
import type { BackupCaptureHealthFacts } from '@/main/modules/backup-capture-readiness/BackupCaptureHealthPolicy';
import { BackupCaptureReadinessService } from '@/main/modules/backup-capture-readiness/BackupCaptureReadinessService';
import { SqliteBackupCaptureReadinessSettingsRepository } from '@/main/modules/backup-capture-readiness/SqliteBackupCaptureReadinessSettingsRepository';
import { CompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';

const competitionId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
let db: Database.Database;
let now: Date;
let facts: BackupCaptureHealthFacts;
let exists: boolean;
let service: BackupCaptureReadinessService;
let readFacts: ReturnType<typeof vi.fn<(id: string) => BackupCaptureHealthFacts>>;

beforeEach(() => {
  db = new Database(':memory:');
  migration084BackupCaptureReadiness.up(db);
  now = new Date('2026-09-09T00:00:00Z');
  exists = true;
  facts = { runId: 'run', sourceId: 'source', state: 'READY', error: null, retainedSourceCheckedAt: now.toISOString() };
  readFacts = vi.fn(() => facts);
  service = new BackupCaptureReadinessService(
    new SqliteBackupCaptureReadinessSettingsRepository(db),
    readFacts,
    () => exists,
    undefined,
    () => now,
  );
});
afterEach(() => db.close());

function configure(mode: 'REQUIRED' | 'ADVISORY' | 'DISABLED') {
  const current = service.get(competitionId);
  return service.save({ ...current.settings, eventId, mode, expectedRevision: current.revision });
}
const scope = { competitionId, phase: 'MATCH' as const, laneIds: ['lane'] };

describe('independent backup start checks', () => {
  it('is disabled by default and does not require capture in deployments with other backup arrangements', () => {
    expect(service.getStartIssues(scope)).toEqual([]);
    expect(readFacts).not.toHaveBeenCalled();
    new CompetitionStartReadiness([service]).assertAllowed(scope);
  });

  it('rechecks actual capture freshness before START and enforces only required mode', () => {
    configure('REQUIRED');
    const start = new CompetitionStartReadiness([service]);
    start.assertAllowed(scope);
    now = new Date(now.getTime() + 15_001);
    expect(() => start.assertAllowed(scope)).toThrow('allowed interval');
    expect(() => start.assertAllowed({ ...scope, phase: 'SIGHTING' })).toThrow('allowed interval');
    configure('ADVISORY');
    expect(start.getStartIssues(scope)[0]?.blocking).toBe(false);
    start.assertAllowed(scope);
    expect(readFacts).toHaveBeenCalledWith(eventId);
  });

  it.each([
    { state: 'STOPPED', runId: null, error: null, expected: 'STOPPED' },
    { state: 'ERROR', runId: 'run', error: 'Source offline', expected: 'ERROR' },
    { state: 'WAITING', runId: 'run', sourceId: null, error: null, expected: 'WAITING' },
    { state: 'READING', runId: 'run', retainedSourceCheckedAt: 'invalid', error: null, expected: 'STALE' },
    { state: 'READY', runId: 'run', retainedSourceCheckedAt: '2026-09-09T01:00:00Z', error: null, expected: 'STALE' },
  ])('blocks $expected capture facts even with a previously retained source', ({ expected, ...patch }) => {
    configure('REQUIRED');
    facts = { ...facts, ...patch };
    expect(service.get(competitionId).health.state).toBe(expected);
    expect(() => new CompetitionStartReadiness([service]).assertAllowed(scope)).toThrow('Cannot start');
  });

  it('does not mark an unchanged source stale when the retained snapshot is still being checked', () => {
    configure('REQUIRED');
    now = new Date(now.getTime() + 120_000);
    facts = { ...facts, retainedSourceCheckedAt: now.toISOString() };
    expect(service.get(competitionId).health.state).toBe('HEALTHY');
  });

  it('keeps event bindings separate, rejects stale edits and validates the saved event on every check', () => {
    const old = service.get(competitionId);
    configure('REQUIRED');
    expect(() => service.save({ ...old.settings, expectedRevision: old.revision })).toThrow('changed');
    const restored = new BackupCaptureReadinessService(
      new SqliteBackupCaptureReadinessSettingsRepository(db),
      readFacts,
      () => exists,
      undefined,
      () => now,
    );
    expect(restored.get(competitionId).settings).toMatchObject({ eventId, mode: 'REQUIRED' });
    expect(restored.get('33333333-3333-4333-8333-333333333333').settings.mode).toBe('DISABLED');
    exists = false;
    expect(restored.get(competitionId).health.state).toBe('UNBOUND');
    expect(() => new CompetitionStartReadiness([restored]).assertAllowed(scope)).toThrow('existing event');
  });

  it('reports an unavailable fact provider as a blocking issue without throwing from the preview', () => {
    configure('REQUIRED');
    readFacts.mockImplementation(() => {
      throw new Error('Status unavailable');
    });
    expect(service.getStartIssues(scope)).toEqual([
      { code: 'BACKUP_CAPTURE_HEALTH', blocking: true, message: 'Status unavailable' },
    ]);
  });
});
