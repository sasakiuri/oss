import type { TimedTargetProgram } from '@sasakiuri/saika-rules';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimedTargetSequenceService } from '@/main/modules/timed-target/application/TimedTargetSequenceService';
import type { TimedTargetState } from '@/main/modules/timed-target/domain/ITimedTargetControl';
import { SqliteTimedTargetSequenceRepository } from '@/main/modules/timed-target/infra/SqliteTimedTargetSequenceRepository';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const program: TimedTargetProgram = {
  id: 'MATCH_4',
  label: '4 second series',
  purpose: 'MATCH',
  ruleReference: '6.4.13',
  loadPreparationSeconds: 60,
  attentionDelayMilliseconds: 7_000,
  attentionToleranceMilliseconds: 100,
  betweenExposuresMilliseconds: 0,
  minimumPauseAfterSeconds: 60,
  exposures: [
    {
      nominalDurationMilliseconds: 4_000,
      signalExtensionMilliseconds: 100,
      recordingAfterTimeMilliseconds: 200,
      maximumShots: 5,
    },
  ],
};

describe('TimedTargetSequenceService', () => {
  let db: Database.Database;
  let states: TimedTargetState[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
    db = createSqliteDb(':memory:');
    states = [];
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  function createService(mode: 'DISABLED' | 'ADVISORY' | 'REQUIRED' = 'REQUIRED') {
    return new TimedTargetSequenceService(
      new SqliteTimedTargetSequenceRepository(db),
      { publish: (state) => states.push(state) },
      mode,
    );
  }

  function start(service: TimedTargetSequenceService) {
    return service.start({
      sequenceId: '00000000-0000-4000-8000-000000000001',
      competitionId: '00000000-0000-4000-8000-000000000002',
      program,
      stageIndex: 1,
      seriesIndex: 0,
      targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
      loadAt: new Date('2026-09-03T00:00:03.000Z'),
    });
  }

  it('drives absolute LOAD, ATTENTION, GREEN, after-time and COMPLETE states', async () => {
    const service = createService();
    expect(start(service).phase).toBe('ARMED');

    await vi.advanceTimersByTimeAsync(3_000);
    expect(states.at(-1)?.phase).toBe('LOAD');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(states.at(-1)?.phase).toBe('ATTENTION');
    await vi.advanceTimersByTimeAsync(7_000);
    expect(states.at(-1)).toMatchObject({ phase: 'FIRING', signal: 'GREEN', shotWindowOpen: true });
    await vi.advanceTimersByTimeAsync(4_100);
    expect(states.at(-1)).toMatchObject({ phase: 'AFTER_TIME', signal: 'RED', shotWindowOpen: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(states.at(-1)).toMatchObject({ phase: 'COMPLETE', signal: 'RED', shotWindowOpen: false });

    const events = db
      .prepare('SELECT event_type FROM timed_target_sequence_events ORDER BY recorded_at, rowid')
      .all() as Array<{ event_type: string }>;
    expect(events.map((entry) => entry.event_type)).toEqual(['STARTED', 'COMPLETED']);
  });

  it('accepts at most the configured shots during green and the 200ms EST after-time', () => {
    const service = createService();
    start(service);
    vi.setSystemTime(new Date('2026-09-03T00:01:14.150Z'));

    for (let index = 0; index < 5; index += 1) {
      expect(
        service.tryAcceptShot({
          competitionId: '00000000-0000-4000-8000-000000000002',
          stageIndex: 1,
          seriesIndex: 0,
          expectedMatchProgramId: 'MATCH_4',
          targetProfileId: 'rapid',
          observationId: `observation-${index}`,
          firedAt: new Date(),
        }).allowed,
      ).toBe(true);
    }
    expect(
      service.tryAcceptShot({
        competitionId: '00000000-0000-4000-8000-000000000002',
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'MATCH_4',
        targetProfileId: 'rapid',
        observationId: 'observation-extra',
        firedAt: new Date(),
      }),
    ).toMatchObject({ allowed: false, reason: expect.stringContaining('maximum of 5') });
  });

  it('matches a shoot-off sequence only against its independently supplied program ID', () => {
    const service = createService();
    service.start({
      sequenceId: '00000000-0000-4000-8000-000000000001',
      competitionId: '00000000-0000-4000-8000-000000000002',
      program: { ...program, id: 'SHOOT_OFF_4', purpose: 'SHOOT_OFF' },
      stageIndex: 1,
      seriesIndex: 0,
      targetProfileId: 'rapid-final',
      loadAt: new Date('2026-09-03T00:00:03.000Z'),
    });
    vi.setSystemTime(new Date('2026-09-03T00:01:10.100Z'));

    expect(
      service.tryAcceptShot({
        competitionId: '00000000-0000-4000-8000-000000000002',
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'MATCH_4',
        expectedShootOffProgramId: 'SHOOT_OFF_4',
        targetProfileId: 'rapid-final',
        observationId: 'shoot-off-observation',
        firedAt: new Date(),
      }),
    ).toMatchObject({ allowed: true, purpose: 'SHOOT_OFF', targetProfileId: 'rapid-final' });
  });

  it('round-trips an opaque isolated-acquisition owner without interpreting it', () => {
    const service = createService();
    const executionContext = {
      shotDisposition: 'ISOLATED' as const,
      owner: 'qualification-recovery',
      referenceId: '00000000-0000-4000-8000-000000000099',
    };
    const state = service.start({
      sequenceId: '00000000-0000-4000-8000-000000000001',
      competitionId: '00000000-0000-4000-8000-000000000002',
      program,
      stageIndex: 1,
      seriesIndex: 0,
      targetProfileId: 'rapid',
      loadAt: new Date('2026-09-03T00:00:03.000Z'),
      executionContext,
    });
    expect(state.executionContext).toEqual(executionContext);

    vi.setSystemTime(new Date('2026-09-03T00:01:10.100Z'));
    expect(
      service.tryAcceptShot({
        competitionId: state.competitionId,
        stageIndex: state.stageIndex,
        seriesIndex: state.seriesIndex,
        expectedMatchProgramId: state.programId,
        targetProfileId: state.targetProfileId,
        observationId: 'isolated-observation',
        firedAt: new Date(),
      }),
    ).toMatchObject({ allowed: true, purpose: 'MATCH', executionContext });

    service.dispose();
    const restored = createService().getState(state.competitionId);
    expect(restored?.executionContext).toEqual(executionContext);
  });

  it('rejects an early shot in REQUIRED mode and preserves it as an advisory warning in ADVISORY mode', () => {
    const required = createService('REQUIRED');
    start(required);
    const input = {
      competitionId: '00000000-0000-4000-8000-000000000002',
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'MATCH_4',
      targetProfileId: 'rapid',
      observationId: 'early',
      firedAt: new Date('2026-09-03T00:00:30.000Z'),
    };
    expect(required.tryAcceptShot(input)).toMatchObject({ allowed: false, reason: expect.stringContaining('LOAD') });

    required.dispose();
    db.close();
    db = createSqliteDb(':memory:');
    const advisory = createService('ADVISORY');
    start(advisory);
    expect(advisory.tryAcceptShot(input)).toMatchObject({ allowed: true, warning: expect.stringContaining('LOAD') });
  });

  it('cancels to RED and enforces the minimum interval before the next LOAD', () => {
    const service = createService();
    start(service);
    vi.setSystemTime(new Date('2026-09-03T00:00:20.000Z'));
    expect(
      service.cancel({
        sequenceId: '00000000-0000-4000-8000-000000000001',
        reason: 'Range interruption',
      }),
    ).toMatchObject({ phase: 'CANCELLED', signal: 'RED' });

    expect(() =>
      service.start({
        sequenceId: '00000000-0000-4000-8000-000000000003',
        competitionId: '00000000-0000-4000-8000-000000000002',
        program,
        stageIndex: 1,
        seriesIndex: 0,
        targetProfileId: 'rapid',
        loadAt: new Date('2026-09-03T00:01:19.999Z'),
      }),
    ).toThrow('Next LOAD is not permitted before 2026-09-03T00:01:20.000Z');
  });

  it('treats an identical command retry as idempotent but rejects a sequence ID collision', () => {
    const service = createService();
    const first = start(service);

    expect(start(service)).toMatchObject({ sequenceId: first.sequenceId, loadAt: first.loadAt });
    expect(() =>
      service.start({
        sequenceId: first.sequenceId,
        competitionId: first.competitionId,
        program,
        stageIndex: 1,
        seriesIndex: 1,
        targetProfileId: first.targetProfileId,
        loadAt: first.loadAt,
      }),
    ).toThrow(`Timed target sequence ID ${first.sequenceId} is already bound to a different schedule`);

    const starts = db
      .prepare("SELECT COUNT(*) AS count FROM timed_target_sequence_events WHERE event_type = 'STARTED'")
      .get() as { count: number };
    expect(starts.count).toBe(1);
  });
});
