import { ISSF_2026_P25 } from '@sasakiuri/saika-rules';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { QualificationRecoveryExecutionService } from '@/main/modules/range-interruptions/application/QualificationRecoveryExecutionService';
import { RangeInterruptionService } from '@/main/modules/range-interruptions/application/RangeInterruptionService';
import type { IQualificationRecoveryExecutionTransport } from '@/main/modules/range-interruptions/domain/IQualificationRecoveryExecutionTransport';
import { SqliteQualificationRecoveryExecutionRepository } from '@/main/modules/range-interruptions/infra/SqliteQualificationRecoveryExecutionRepository';
import { SqliteRangeInterruptionRepository } from '@/main/modules/range-interruptions/infra/SqliteRangeInterruptionRepository';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { QualificationRecoveryShotPayload, QualificationRecoveryStatePayload } from '@/shared/mqtt';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';

describe('QualificationRecoveryExecutionService', () => {
  let database: Database.Database;
  let rangeService: RangeInterruptionService;
  let executionService: QualificationRecoveryExecutionService;
  let startTransport: ReturnType<typeof vi.fn<IQualificationRecoveryExecutionTransport['start']>>;
  let cancelTransport: ReturnType<typeof vi.fn<IQualificationRecoveryExecutionTransport['cancel']>>;
  let applyTransport: ReturnType<typeof vi.fn<IQualificationRecoveryExecutionTransport['apply']>>;
  let now: Date;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    const rangeRepository = new SqliteRangeInterruptionRepository(database);
    const executionRepository = new SqliteQualificationRecoveryExecutionRepository(database);
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_P25));
    rangeService = new RangeInterruptionService(rangeRepository, competitionTypes, executionRepository);
    now = new Date('2026-09-03T01:16:00.000Z');
    startTransport = vi.fn(async (input) => ({
      commandId: crypto.randomUUID(),
      action: 'start-qualification-recovery' as const,
      success: true,
      lanes: [{ laneId: input.laneId, status: 'done' as const, acknowledgedAt: '2026-09-03T01:16:01.000Z' }],
    }));
    cancelTransport = vi.fn(async (input) => ({
      commandId: crypto.randomUUID(),
      action: 'cancel-qualification-recovery' as const,
      success: true,
      lanes: [{ laneId: input.laneId, status: 'done' as const, acknowledgedAt: '2026-09-03T01:17:01.000Z' }],
    }));
    applyTransport = vi.fn(async (input) => ({
      commandId: crypto.randomUUID(),
      action: 'apply-qualification-recovery' as const,
      success: true,
      lanes: [{ laneId: input.laneId, status: 'done' as const, acknowledgedAt: '2026-09-03T01:19:01.000Z' }],
    }));
    executionService = new QualificationRecoveryExecutionService(
      rangeRepository,
      executionRepository,
      { start: startTransport, cancel: cancelTransport, apply: applyTransport },
      () => new Date(now),
    );
  });

  afterEach(() => database.close());

  it('requires persisted sighting completion and the full pause before target-failure recovery', async () => {
    const interruption = await createDecidedInterruption(rangeService, true);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    expect(decision.authorizedRecovery.minimumPauseAfterSightingSeconds).toBe(60);
    const input = {
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY' as const,
    };
    await expect(executionService.start(input)).rejects.toThrow('Complete the authorized extra sighting');
    const sighting = await executionService.start({ ...input, phase: 'EXTRA_SIGHTING' });
    expect(
      executionService.observeState({
        ...recoveryState(sighting.runId, interruption.id, decision.id),
        authorization: sighting.authorization,
        decisionRuleReference: decision.ruleReference,
        status: 'COMPLETED',
        terminalReason: 'Sighting completed',
        terminalAt: '2026-09-03T01:22:00.000Z',
        publishedAt: '2026-09-03T01:22:00.100Z',
      }),
    ).toBe(true);
    now = new Date('2026-09-03T01:22:59.999Z');
    await expect(executionService.start(input)).rejects.toThrow('pause after sighting');
    now = new Date('2026-09-03T01:23:00.000Z');
    const execution = await executionService.start(input);
    expect(execution.authorization).toMatchObject({
      sightingPrerequisite: { runId: sighting.runId, minimumPauseSeconds: 60 },
    });
  });

  it('derives separate sighting and series runs from the latest immutable decision', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;

    const sighting = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'EXTRA_SIGHTING',
    });
    expect(sighting).toMatchObject({
      caseId: interruption.id,
      decisionId: decision.id,
      phase: 'EXTRA_SIGHTING',
      status: 'ACCEPTED',
      authorization: { phase: 'EXTRA_SIGHTING', shotsToFire: 5 },
    });
    expect(startTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runId: sighting.runId,
        interruptionId: interruption.id,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 2,
        officialName: 'Jury Member A',
      }),
    );

    const repeated = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'EXTRA_SIGHTING',
    });
    expect(repeated.runId).toBe(sighting.runId);
    expect(startTransport).toHaveBeenCalledTimes(1);

    const series = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });
    expect(series).toMatchObject({
      phase: 'SERIES_RECOVERY',
      authorization: {
        phase: 'SERIES_RECOVERY',
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 3,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
        },
      },
    });
    expect(series.runId).not.toBe(sighting.runId);
    expect(startTransport).toHaveBeenCalledTimes(2);
  });

  it('journals matching Lane state and shots while retaining mismatched evidence as rejected', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const execution = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });
    const state = recoveryState(execution.runId, interruption.id, decision.id);
    const shot = recoveryShot(execution.runId, interruption.id, decision.id);

    expect(executionService.observeState(state)).toBe(true);
    expect(
      executionService.observeState({
        ...state,
        officialName: 'Different Official',
        publishedAt: '2026-09-03T01:16:03.000Z',
      }),
    ).toBe(false);
    expect(executionService.observeShot(shot)).toBe(true);
    expect(executionService.observeShot(shot)).toBe(true);
    expect(
      executionService.observeShot({
        ...shot,
        shotId: '55555555-5555-4555-8555-555555555555',
        laneId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toBe(false);

    const projected = await rangeService.getById(interruption.id);
    expect(projected.qualificationRecoveryExecutions[0]).toMatchObject({
      runId: execution.runId,
      status: 'RUNNING',
      latestLaneState: { status: 'RUNNING' },
    });
    expect(projected.qualificationRecoveryExecutions[0]?.shots).toEqual([shot]);
    expect(projected.qualificationRecoveryExecutions[0]?.events.map((event) => event.type)).toEqual([
      'START_RESULT',
      'LANE_STATE',
      'LANE_STATE_REJECTED',
      'SHOT',
      'SHOT_REJECTED',
    ]);
  });

  it('accepts a completed Lane window with unfired shots for later miss adjudication', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const execution = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });

    expect(
      executionService.observeState({
        ...recoveryState(execution.runId, interruption.id, decision.id),
        status: 'COMPLETED',
        terminalReason: 'Qualification recovery timing completed',
        terminalAt: '2026-09-03T01:18:30.000Z',
        shots: [],
        publishedAt: '2026-09-03T01:18:30.010Z',
      }),
    ).toBe(true);

    const projected = await rangeService.getById(interruption.id);
    expect(projected.qualificationRecoveryExecutions[0]).toMatchObject({
      status: 'COMPLETED',
      latestLaneState: { status: 'COMPLETED', shots: [] },
    });
  });

  it('adjudicates a completed series through a separate immutable request', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const execution = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });
    const shot = recoveryShot(execution.runId, interruption.id, decision.id);
    executionService.observeShot(shot);
    executionService.observeState({
      ...recoveryState(execution.runId, interruption.id, decision.id),
      status: 'COMPLETED',
      terminalReason: 'Qualification recovery timing completed',
      terminalAt: '2026-09-03T01:18:30.000Z',
      shots: [
        {
          shotId: shot.shotId,
          observationId: null,
          firedAt: shot.firedAt,
          recordedAt: '2026-09-03T01:16:10.010Z',
        },
      ],
      publishedAt: '2026-09-03T01:18:30.010Z',
    });
    now = new Date('2026-09-03T01:19:00.000Z');

    const adjudicated = await executionService.adjudicate({
      caseId: interruption.id,
      runId: execution.runId,
      appliedBy: 'Jury Member B',
      statement: 'Lane evidence checked; credit the recovery series.',
    });

    expect(adjudicated.status).toBe('ADJUDICATED');
    expect(applyTransport).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      runId: execution.runId,
      appliedBy: 'Jury Member B',
      statement: 'Lane evidence checked; credit the recovery series.',
      appliedAt: '2026-09-03T01:19:00.000Z',
    });
    expect(adjudicated.events.slice(-2).map((event) => event.type)).toEqual([
      'ADJUDICATION_REQUESTED',
      'ADJUDICATION_RESULT',
    ]);
  });

  it('retries the same immutable adjudication request without changing its official timestamp', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const execution = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });
    executionService.observeState({
      ...recoveryState(execution.runId, interruption.id, decision.id),
      status: 'COMPLETED',
      terminalReason: 'Qualification recovery timing completed with unfired shots',
      terminalAt: '2026-09-03T01:18:30.000Z',
      shots: [],
      publishedAt: '2026-09-03T01:18:30.010Z',
    });
    now = new Date('2026-09-03T01:19:00.000Z');
    applyTransport.mockRejectedValueOnce(new Error('broker unavailable'));
    const input = {
      caseId: interruption.id,
      runId: execution.runId,
      appliedBy: 'Jury Member B',
      statement: 'Credit the observed shots and record unfired authorized shots as misses.',
    };

    await expect(executionService.adjudicate(input)).rejects.toThrow('broker unavailable');
    const failed = (await rangeService.getById(interruption.id)).qualificationRecoveryExecutions[0]!;
    expect(failed.status).toBe('ADJUDICATION_FAILED');
    expect(failed.events.filter((event) => event.type === 'ADJUDICATION_REQUESTED')).toHaveLength(1);

    now = new Date('2026-09-03T01:25:00.000Z');
    const retried = await executionService.adjudicate(input);

    expect(retried.status).toBe('ADJUDICATED');
    expect(applyTransport).toHaveBeenCalledTimes(2);
    expect(applyTransport.mock.calls.map(([request]) => request.appliedAt)).toEqual([
      '2026-09-03T01:19:00.000Z',
      '2026-09-03T01:19:00.000Z',
    ]);
    expect(retried.events.filter((event) => event.type === 'ADJUDICATION_REQUESTED')).toHaveLength(1);
    await expect(
      executionService.adjudicate({ ...input, statement: 'A changed adjudication statement.' }),
    ).rejects.toThrow('different adjudication request');
    expect(applyTransport).toHaveBeenCalledTimes(2);

    database
      .prepare(
        `INSERT INTO qualification_recovery_execution_events (
          id, event_key, run_id, event_type, payload_json, occurred_at, recorded_at
        ) VALUES (?, ?, ?, 'ADJUDICATION_ERROR', ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        `adjudication-error:late:${execution.runId}`,
        execution.runId,
        JSON.stringify({ error: 'Late timeout from a concurrent delivery' }),
        '2026-09-03T01:26:00.000Z',
        '2026-09-03T01:26:00.000Z',
      );
    expect((await rangeService.getById(interruption.id)).qualificationRecoveryExecutions[0]?.status).toBe(
      'ADJUDICATED',
    );
  });

  it('does not adjudicate until completed state and shot evidence agree', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const execution = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });
    const shot = recoveryShot(execution.runId, interruption.id, decision.id);
    executionService.observeState({
      ...recoveryState(execution.runId, interruption.id, decision.id),
      status: 'COMPLETED',
      terminalReason: 'Qualification recovery timing completed',
      terminalAt: '2026-09-03T01:18:30.000Z',
      shots: [
        {
          shotId: shot.shotId,
          observationId: null,
          firedAt: shot.firedAt,
          recordedAt: '2026-09-03T01:16:10.010Z',
        },
      ],
      publishedAt: '2026-09-03T01:18:30.010Z',
    });
    now = new Date('2026-09-03T01:19:00.000Z');

    await expect(
      executionService.adjudicate({
        caseId: interruption.id,
        runId: execution.runId,
        appliedBy: 'Jury Member B',
        statement: 'Attempt before all evidence arrived.',
      }),
    ).rejects.toThrow('do not match');
    expect(applyTransport).not.toHaveBeenCalled();
  });

  it('rejects an execution for a competition outside the interruption scope', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;

    await expect(
      executionService.start({
        caseId: interruption.id,
        decisionId: decision.id,
        competitionId: '66666666-6666-4666-8666-666666666666',
        phase: 'SERIES_RECOVERY',
      }),
    ).rejects.toThrow('is not linked to range interruption');
    expect(startTransport).not.toHaveBeenCalled();
  });

  it('reuses the immutable run when an explicit retry follows a transport failure', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    startTransport.mockRejectedValueOnce(new Error('broker unavailable'));
    const input = {
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY' as const,
    };

    await expect(executionService.start(input)).rejects.toThrow('broker unavailable');
    const failed = (await rangeService.getById(interruption.id)).qualificationRecoveryExecutions[0]!;
    expect(failed.status).toBe('COMMAND_FAILED');

    const retried = await executionService.start(input);
    expect(retried.runId).toBe(failed.runId);
    expect(retried.status).toBe('ACCEPTED');
    expect(startTransport).toHaveBeenCalledTimes(2);
    expect(startTransport.mock.calls[1]?.[0].runId).toBe(failed.runId);
  });

  it('records cancellation attempts without rewriting the immutable execution', async () => {
    const interruption = await createDecidedInterruption(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const execution = await executionService.start({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      phase: 'SERIES_RECOVERY',
    });
    executionService.observeState(recoveryState(execution.runId, interruption.id, decision.id));

    const cancelled = await executionService.cancel({
      caseId: interruption.id,
      runId: execution.runId,
      reason: 'Jury withdrew the firing authorization',
    });

    expect(cancelled.status).toBe('CANCELLING');
    expect(cancelTransport).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      runId: execution.runId,
      reason: 'Jury withdrew the firing authorization',
    });
    expect(() =>
      database
        .prepare('UPDATE qualification_recovery_executions SET official_name = ? WHERE run_id = ?')
        .run('Changed', execution.runId),
    ).toThrow('immutable');
    expect(() =>
      database
        .prepare('UPDATE qualification_recovery_execution_events SET payload_json = ? WHERE run_id = ?')
        .run('{}', execution.runId),
    ).toThrow('append-only');
  });
});

async function createDecidedInterruption(service: RangeInterruptionService, targetFailure = false) {
  const opened = await service.create({
    scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
    cause: targetFailure ? 'ALL_TARGET_FAILURE' : 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: '2026-09-03T01:00:00.000Z',
    remainingSecondsAtStart: 0,
    laneId: LANE_ID,
    firingPointNumber: 12,
    summary: '25m precision series interrupted',
    details: 'The series stopped after two recorded shots because of a technical fault.',
    openedBy: 'Range Officer A',
    qualificationTimedTargetContext: {
      competitionTypeId: 'P25',
      stageIndex: 1,
      seriesIndex: 0,
      recordedShots: 2,
      seriesComplete: false,
      laneSnapshotCapturedAt: '2026-09-03T01:00:01.000Z',
    },
  });
  const ended = await service.appendEntry({
    caseId: opened.id,
    type: 'ENDED',
    occurredAt: '2026-09-03T01:15:01.000Z',
    statement: 'Technical service restored',
    officialName: 'Range Officer A',
  });
  if (ended.recommendation?.type !== 'QUALIFICATION_TIMED_TARGET') throw new Error('Recommendation unavailable');
  return service.recordQualificationTimedTargetRecoveryDecision({
    caseId: opened.id,
    authorizedRecovery: {
      extraSightingSeriesShots: ended.recommendation.extraSighting.shots,
      ...(ended.recommendation.minimumPauseAfterSightingSeconds !== undefined
        ? { minimumPauseAfterSightingSeconds: ended.recommendation.minimumPauseAfterSightingSeconds }
        : {}),
      seriesRecovery: ended.recommendation.seriesRecovery,
    },
    statement: 'The Jury authorizes the Rule Pack recommendation.',
    officialName: 'Jury Member A',
    incidentReportReference: 'RIR-25M-001',
    ruleReference: ended.recommendation.ruleReferences.join('; '),
    decidedAt: '2026-09-03T01:15:05.000Z',
  });
}

function recoveryState(runId: string, interruptionId: string, decisionId: string): QualificationRecoveryStatePayload {
  return {
    schemaVersion: 1,
    laneId: LANE_ID,
    runId,
    sequenceId: runId,
    decisionId,
    interruptionId,
    competitionId: COMPETITION_ID,
    stageIndex: 1,
    seriesIndex: 0,
    expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
    executionProgramId: 'P25_MATCH_PRECISION_240:qualification-recovery',
    expectedSeriesShotLimit: 5,
    expectedRecordedShots: 2,
    authorization: {
      phase: 'SERIES_RECOVERY',
      seriesRecovery: {
        treatment: 'COMPLETE_REMAINING_SHOTS',
        shotsToFire: 3,
        execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
      },
    },
    targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
    loadAt: '2026-09-03T01:16:02.000Z',
    officialName: 'Jury Member A',
    decisionRuleReference: '8.8.1(a); 8.8.1(c-d)',
    decidedAt: '2026-09-03T01:15:05.000Z',
    startedAt: '2026-09-03T01:16:00.000Z',
    status: 'RUNNING',
    terminalReason: null,
    terminalAt: null,
    shots: [],
    publishedAt: '2026-09-03T01:16:02.000Z',
  };
}

function recoveryShot(runId: string, interruptionId: string, decisionId: string): QualificationRecoveryShotPayload {
  return {
    schemaVersion: 1,
    laneId: LANE_ID,
    competitionId: COMPETITION_ID,
    runId,
    decisionId,
    interruptionId,
    phase: 'SERIES_RECOVERY',
    stageIndex: 1,
    seriesIndex: 0,
    shotId: '44444444-4444-4444-8444-444444444444',
    x: 1.1,
    y: -0.2,
    rawScoreX10: 101,
    deviceScoreX10: 100,
    calculatedScoreX10: 101,
    effectiveScoreX10: 101,
    innerTen: false,
    firedAt: '2026-09-03T01:16:10.000Z',
    receivedAt: '2026-09-03T01:16:10.010Z',
    publishedAt: '2026-09-03T01:16:10.020Z',
  };
}
