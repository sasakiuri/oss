import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { migration013ResultVerification } from '@/main/infrastructure/database/migrations/013_result_verification';
import { migration027EstBackupVerification } from '@/main/infrastructure/database/migrations/027_est_backup_verification';
import { migration080EstBackupResultScope } from '@/main/infrastructure/database/migrations/080_est_backup_result_scope';
import { migration082EstBackupSources } from '@/main/infrastructure/database/migrations/082_est_backup_sources';
import { Participant, ParticipantId, EventId } from '@/main/modules/championship';
import {
  EstBackupVerificationService,
  EstBackupResultCheckService,
  SqliteEstBackupVerificationRepository,
  compareEstBackup,
} from '@/main/modules/est-backup-verification';
import {
  ResultVerificationService,
  ResultVerificationSourceRegistry,
  SqliteResultVerificationRepository,
  type VerifiableResult,
} from '@/main/modules/result-verification';
import type { RankedResultDto, ApplyEstBackupChecksPayload, EstBackupVerificationRunDto } from '@/shared/ipc/contracts';

const eventId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const dbs: Database.Database[] = [];
afterEach(() => dbs.splice(0).forEach((db) => db.close()));
function setup(
  modifyRun?: (run: EstBackupVerificationRunDto) => void,
  scope: 'QUALIFICATION' | 'FINAL' = 'QUALIFICATION',
  mixed = false,
) {
  const db = new Database(':memory:');
  dbs.push(db);
  migration013ResultVerification.up(db);
  migration027EstBackupVerification.up(db);
  migration080EstBackupResultScope.up(db);
  migration082EstBackupSources.up(db);
  const results: VerifiableResult[] = ids.map((id, i) => ({
    resultId: id,
    participantId: mixed ? `TEAM:team-${i}` : `athlete-${i}`,
    playerName: `Athlete ${i}`,
    affiliation: 'Club',
    relayNumber: 1,
    rank: i + 1,
    totalScore: 630 - i,
    revision: String(i).repeat(64),
    decisionCount: i,
    status: 'confirmed',
    entryStatus: 'COMPETING' as const,
    classificationCode: null,
    projectionIssues: [],
    evidenceSummary: {
      expectedShots: 60,
      linkedShots: 60,
      independentDecimalShots: 60,
      innerTenClassifiedShots: 60,
      scoreConflicts: 0,
    },
  }));
  const source = new ResultVerificationSourceRegistry([
    {
      resultScope: scope,
      load: async () => ({
        eventId,
        resultScope: scope,
        configuredIndividualChecks: 10,
        configuredTeamChecks: 0,
        teamVerificationSupported: true,
        requiredTeamChecks: 0,
        checkedTeamResults: 0,
        teamVerificationRunId: null,
        teamSnapshotRevision: null,
        sourceRevision: null,
        results,
        issues: [],
      }),
    },
  ]);
  const checks = new SqliteResultVerificationRepository(db);
  const target = new ResultVerificationService(checks, source);
  const runs = new SqliteEstBackupVerificationRepository(db);
  const subjects = results.map((result) => ({
    key: mixed ? result.participantId.slice('TEAM:'.length) : result.participantId,
    name: result.playerName,
    rank: result.rank,
    totalScore: result.totalScore,
    interventionCount: result.decisionCount,
    resultBinding: { resultId: result.resultId, participantId: result.participantId, resultRevision: result.revision },
  }));
  const records = subjects.map((subject) => ({ key: subject.key, totalScore: subject.totalScore, rank: subject.rank }));
  const run: EstBackupVerificationRunDto = {
    id: runId,
    eventId,
    resultScope: scope,
    resultKind: mixed ? 'MIXED_TEAM' : 'INDIVIDUAL',
    keyType: mixed ? 'TEAM_ID' : 'PARTICIPANT_ID',
    sourceName: 'Independent EST memory',
    sourceReference: 'sha256:abc',
    items: compareEstBackup(subjects, records),
    snapshotRevision: 'a'.repeat(64),
    verified: true,
    officialName: 'RTS A',
    verifiedAt: '2026-09-09T00:00:00Z',
    interventionReviewStatement: 'Compared incident reports',
  };
  modifyRun?.(run);
  runs.append(run, records);
  const service = new EstBackupResultCheckService(runs, target);
  const request = async (): Promise<ApplyEstBackupChecksPayload> => ({
    eventId,
    runId,
    digest: (await service.preview(eventId, runId)).digest,
    resultIds: [...ids],
    evidenceSource: 'INDEPENDENT_MEMORY',
    manualInterventionsReviewed: true,
    statement: 'Reviewed independent memory and all incident reports.',
    officialName: 'RTS B',
  });
  return { db, results, target, checks, runs, service, request };
}

describe('EST backup to individual result checks', () => {
  it.each([false, true])('records revision-bound Final checks after reload (Mixed Team: %s)', async (mixed) => {
    const f = setup(undefined, 'FINAL', mixed);
    const retained = f.runs.findByEvent(eventId)[0]!;
    expect(retained.resultScope).toBe('FINAL');
    const receipt = await f.service.apply(await f.request());
    expect(receipt.items.every((item) => item.state === 'CREATED')).toBe(true);
    const status = await f.target.getStatus(eventId, 'FINAL');
    expect(status.checkedIndividualResults).toBe(2);
    expect(status.currentApproval).toBeNull();
    f.results[0] = { ...f.results[0]!, revision: 'f'.repeat(64) };
    expect((await f.service.preview(eventId, runId)).items[0]?.state).toBe('BLOCKED');
  });

  it('does not use Qualification results when a retained run is labelled Final', async () => {
    const f = setup((run) => {
      run.resultScope = 'FINAL';
    });
    await expect(f.service.preview(eventId, runId)).rejects.toThrow('not supported for FINAL');
  });

  it('migrates historical comparisons to Qualification while keeping their contents append-only', () => {
    const db = new Database(':memory:');
    dbs.push(db);
    migration027EstBackupVerification.up(db);
    db.prepare(
      `INSERT INTO est_backup_verification_runs
      (id,event_id,result_kind,key_type,source_name,records_json,comparison_json,snapshot_revision,verified,official_name,verified_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      runId,
      eventId,
      'INDIVIDUAL',
      'START_NUMBER',
      'Old memory',
      '[]',
      '[]',
      'a'.repeat(64),
      0,
      'Jury',
      '2026-09-09T00:00:00Z',
    );
    migration080EstBackupResultScope.up(db);
    expect(new SqliteEstBackupVerificationRepository(db).findByEvent(eventId)[0]?.resultScope).toBe('QUALIFICATION');
    expect(() => db.prepare('UPDATE est_backup_verification_runs SET result_scope = ?').run('FINAL')).toThrow(
      'append-only',
    );
  });
  it('captures the exact result revision while comparing a start-number backup and retains it across service reconstruction', async () => {
    const f = setup();
    const athlete = Participant.create(
      ParticipantId.create(ids[0]!),
      EventId.create(eventId),
      'Athlete',
      'Club',
      null,
      0,
      'Athlete',
      { startNumber: '001' },
    );
    const result: RankedResultDto = {
      ...f.results[0]!,
      entryStatus: 'COMPETING',
      id: ids[0]!,
      participantId: ids[0]!,
      familyName: 'Athlete',
      projectionIssues: [],
      remarks: [],
      seriesScores: [630],
      baseTotalScore: 630,
      scoreAdjustment: 0,
      deductionTotal: 0,
      confirmedAt: '2026-09-09T00:00:00Z',
    };
    const service = new EstBackupVerificationService(
      f.runs,
      { findByEventId: () => [athlete] },
      { getByEvent: async () => [result], getByRelay: async () => [result] },
      { getQualification: async () => [] },
    );
    const run = await service.verify({
      eventId,
      resultKind: 'INDIVIDUAL',
      keyType: 'START_NUMBER',
      sourceName: 'Target printout',
      records: [{ key: '001', totalScore: 630 }],
      officialName: 'RTS official',
    });
    const persisted = new SqliteEstBackupVerificationRepository(f.db)
      .findByEvent(eventId)
      .find((value) => value.id === run.id)!;
    expect(persisted.items[0]).toMatchObject({
      key: '001',
      status: 'MATCH',
      resultBinding: { resultId: ids[0], participantId: ids[0], resultRevision: result.revision },
    });
  });

  it('persists result bindings and selected checks, preserves independent approval and skips current matches after reload', async () => {
    const f = setup();
    expect(
      new SqliteEstBackupVerificationRepository(f.db).findByEvent(eventId)[0]!.items[0]!.resultBinding?.resultId,
    ).toBe(ids[0]);
    const input = await f.request();
    expect(f.checks.findChecksByEvent(eventId)).toHaveLength(0);
    expect(await f.service.apply({ ...input, resultIds: [ids[1]!] })).toMatchObject({ items: [{ state: 'CREATED' }] });
    const saved = f.checks.findChecksByEvent(eventId)[0]!;
    expect(saved).toMatchObject({
      resultId: ids[1],
      evidenceReference: `EST_BACKUP:${runId}`,
      officialName: 'RTS B',
      manualInterventionsReviewed: true,
    });
    expect((await f.target.getStatus(eventId)).currentApproval).toBeNull();
    await expect(f.service.apply(input)).rejects.toThrow('changed');
    const retry = await f.request();
    expect((await f.service.apply(retry)).items.map((item) => item.state)).toEqual(['CREATED', 'ALREADY_VERIFIED']);
    expect(f.checks.findChecksByEvent(eventId)).toHaveLength(2);
    expect((await f.target.getStatus(eventId)).readyForApproval).toBe(true);
    expect((await f.target.getStatus(eventId)).currentApproval).toBeNull();
  });

  it('rejects same-total shot revisions and changed participant identities while allowing a fresh unaffected selection', async () => {
    const f = setup();
    const input = await f.request();
    f.results[0] = { ...f.results[0]!, revision: 'c'.repeat(64) };
    await expect(f.service.apply(input)).rejects.toThrow('changed');
    const next = await f.request();
    await expect(f.service.apply(next)).rejects.toThrow('changed since comparison');
    expect((await f.service.apply({ ...next, resultIds: [ids[1]!] })).items[0]?.state).toBe('CREATED');
    f.results[1] = { ...f.results[1]!, participantId: 'another-athlete' };
    expect((await f.service.preview(eventId, runId)).items.every((item) => item.state === 'BLOCKED')).toBe(true);
  });

  it('blocks old comparison rows without exact result bindings and refuses wrong events and team comparisons', async () => {
    const f = setup((run) => {
      delete run.items[0]!.resultBinding;
    });
    const preview = await f.service.preview(eventId, runId);
    expect(preview.items[0]).toMatchObject({ resultId: null, state: 'BLOCKED' });
    expect(preview.items[0]!.issue).toContain('older comparison');
    await expect(f.service.preview(ids[0]!, runId)).rejects.toThrow('from this event');
    const team = setup((run) => {
      run.resultKind = 'TEAM';
    });
    await expect(team.service.preview(eventId, runId)).rejects.toThrow('individual or Mixed Team Final comparison');
  });

  it('requires deliberate source review, refuses ambiguous identity keys, and never overwrites a current mismatch', async () => {
    const f = setup();
    const input = await f.request();
    await expect(f.service.apply({ ...input, statement: '' })).rejects.toThrow('must review');
    await expect(f.service.apply({ ...input, resultIds: [ids[0]!, ids[0]!] })).rejects.toThrow('distinct');
    const current = f.results[0]!;
    await f.target.addCheck({
      eventId,
      resultScope: 'QUALIFICATION',
      resultId: current.resultId,
      resultRevision: current.revision,
      evidenceSource: 'TARGET_PRINTOUT',
      evidenceReference: 'Disputed printout',
      comparisonStatus: 'MISMATCH',
      manualInterventionsReviewed: false,
      officialName: 'RTS C',
    });
    expect((await f.service.preview(eventId, runId)).items[0]!.issue).toContain('unsuccessful check');
    const ambiguous = setup((run) => {
      run.items[1]!.resultBinding = run.items[0]!.resultBinding;
    });
    await expect(ambiguous.service.preview(eventId, runId)).rejects.toThrow('ambiguous');
    const subject = { key: '001', name: 'A', rank: 1, totalScore: 630, interventionCount: 0 };
    expect(() => compareEstBackup([subject, subject], [{ key: '001', totalScore: 630 }])).toThrow('unique');
  });

  it('reports partial writes when a result changes mid-batch', async () => {
    const f = setup();
    const add = f.target.addCheck.bind(f.target);
    vi.spyOn(f.target, 'addCheck').mockImplementation(async (input) => {
      if (input.resultId === ids[1]) f.results[1] = { ...f.results[1]!, revision: 'd'.repeat(64) };
      return add(input);
    });
    const result = await f.service.apply(await f.request());
    expect(result.items.map((item) => item.state)).toEqual(['CREATED', 'FAILED']);
    expect(result.items[1]!.issue).toContain('changed');
    expect(f.checks.findChecksByEvent(eventId)).toHaveLength(1);
  });

  it('detects another official recording a check between preview and write', async () => {
    const f = setup();
    const add = f.target.addCheck.bind(f.target);
    let injected = false;
    vi.spyOn(f.target, 'addCheck').mockImplementation(async (input) => {
      if (!injected) {
        injected = true;
        await add({
          ...input,
          expectedPreviousCheckId: undefined,
          comparisonStatus: 'MISMATCH',
          officialName: 'Concurrent official',
        });
      }
      return add(input);
    });
    const receipt = await f.service.apply({ ...(await f.request()), resultIds: [ids[0]!] });
    expect(receipt.items[0]).toMatchObject({
      state: 'FAILED',
      issue: expect.stringContaining('verification record changed'),
    });
    expect(f.checks.findChecksByEvent(eventId)).toHaveLength(1);
    expect(f.checks.findChecksByEvent(eventId)[0]!.comparisonStatus).toBe('MISMATCH');
  });
});
