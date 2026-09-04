// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  ApplyQualificationRecoveryCommandSchema,
  EstComplaintSignalPayloadSchema,
  HardwareStatePayloadSchema,
  LaneScorePayloadSchema,
  QualificationMalfunctionSignalPayloadSchema,
  QualificationRecoveryFiringAuthorizationSchema,
  QualificationRecoveryShotPayloadSchema,
  QualificationRecoveryStatePayloadSchema,
  RawShotPayloadSchema,
  SettleQualificationRecoveryCommandSchema,
  StartQualificationRecoveryCommandSchema,
  StartShootOffCommandSchema,
  TimedTargetStatePayloadSchema,
} from '@/shared/mqtt/protocol';

describe('HardwareStatePayloadSchema', () => {
  const legacyState = {
    laneId: '11111111-1111-4111-8111-111111111111',
    laneAlias: 'Lane 1',
    connection: { status: 'connected', manufacturer: 'SIUS' },
    appVersion: '0.3.0',
    publishedAt: '2026-09-07T00:00:00.000Z',
  };

  it('keeps accepting Lane versions that do not report target integration', () => {
    expect(HardwareStatePayloadSchema.safeParse(legacyState).success).toBe(true);
  });

  it('accepts exact device identity and explicit timed-target integration limits', () => {
    const parsed = HardwareStatePayloadSchema.parse({
      ...legacyState,
      connection: { ...legacyState.connection, deviceId: 'HS25' },
      capabilities: {
        competitionProtocolVersions: [1],
        rulePacks: [],
        targetIntegration: {
          schemaVersion: 1,
          timedTarget: { actuation: 'NOT_INTEGRATED', feedback: 'NOT_INTEGRATED' },
        },
      },
    });

    expect(parsed.connection.deviceId).toBe('HS25');
    expect(parsed.capabilities?.targetIntegration?.timedTarget).toEqual({
      actuation: 'NOT_INTEGRATED',
      feedback: 'NOT_INTEGRATED',
    });
  });
});

describe('EstComplaintSignalPayloadSchema', () => {
  const activeSignal = {
    schemaVersion: 1,
    laneId: '11111111-1111-4111-8111-111111111111',
    status: 'ACTIVE',
    signalId: '22222222-2222-4222-8222-222222222222',
    issue: 'SHOT_VALUE',
    context: {
      competitionId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      participantId: '55555555-5555-4555-8555-555555555555',
      participantName: 'Test Athlete',
      startNumber: '12',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: 'rapid-4s',
      exposureIndex: 2,
      lastShot: {
        shotId: '66666666-6666-4666-8666-666666666666',
        shotNumberInSeries: 3,
        firedAt: '2026-09-04T00:00:00.000Z',
        receivedAt: '2026-09-04T00:00:00.100Z',
      },
    },
    message: null,
    signalledAt: '2026-09-04T00:00:01.000Z',
    clearedAt: null,
    clearedBy: null,
    publishedAt: '2026-09-04T00:00:02.000Z',
  };

  it('accepts a complete Lane observation snapshot', () => {
    expect(EstComplaintSignalPayloadSchema.safeParse(activeSignal).success).toBe(true);
  });

  it('rejects a partial latest-shot snapshot', () => {
    expect(
      EstComplaintSignalPayloadSchema.safeParse({
        ...activeSignal,
        context: { ...activeSignal.context, lastShot: { shotId: activeSignal.context.lastShot.shotId } },
      }).success,
    ).toBe(false);
  });
});

describe('QualificationMalfunctionSignalPayloadSchema', () => {
  const activeSignal = {
    schemaVersion: 1,
    laneId: '11111111-1111-4111-8111-111111111111',
    status: 'ACTIVE',
    signalId: '22222222-2222-4222-8222-222222222222',
    context: {
      competitionId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      participantId: '55555555-5555-4555-8555-555555555555',
      participantName: 'Test Athlete',
      startNumber: '12',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: 'rapid-4s',
      exposureIndex: 2,
    },
    message: null,
    signalledAt: '2026-09-04T00:00:00.000Z',
    clearedAt: null,
    clearedBy: null,
    publishedAt: '2026-09-04T00:00:01.000Z',
  };

  it('accepts a complete Lane observation snapshot', () => {
    expect(QualificationMalfunctionSignalPayloadSchema.safeParse(activeSignal).success).toBe(true);
  });

  it('rejects a declaration whose shot count exceeds its captured series limit', () => {
    expect(
      QualificationMalfunctionSignalPayloadSchema.safeParse({
        ...activeSignal,
        context: { ...activeSignal.context, recordedShots: 6 },
      }).success,
    ).toBe(false);
  });
});

const BASE_SCORE = {
  competitionId: '11111111-1111-4111-8111-111111111111',
  laneId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  totalScoreX10: 205,
  totalShotCount: 2,
  acc: 'DECIMAL' as const,
  stages: [
    {
      stageIndex: 1,
      stageName: 'Match',
      stageTotalX10: 205,
      series: [
        {
          seriesIndex: 0,
          shots: [105, 100],
          seriesTotalX10: 205,
          isComplete: false,
        },
      ],
    },
  ],
  publishedAt: '2026-08-28T00:00:00.000Z',
};

describe('LaneScorePayloadSchema', () => {
  it('accepts a score whose shot count and aggregate totals agree', () => {
    expect(LaneScorePayloadSchema.safeParse(BASE_SCORE).success).toBe(true);
  });

  it('rejects a total score that disagrees with its stages', () => {
    expect(LaneScorePayloadSchema.safeParse({ ...BASE_SCORE, totalScoreX10: 999 }).success).toBe(false);
  });

  it('rejects a series total that disagrees with its shots', () => {
    const score = structuredClone(BASE_SCORE);
    score.stages[0]!.series[0]!.seriesTotalX10 = 204;

    expect(LaneScorePayloadSchema.safeParse(score).success).toBe(false);
  });

  it('rejects a shot count that disagrees with its series', () => {
    expect(LaneScorePayloadSchema.safeParse({ ...BASE_SCORE, totalShotCount: 60 }).success).toBe(false);
  });

  it('rejects shot values outside the physical score range', () => {
    const score = structuredClone(BASE_SCORE);
    score.totalScoreX10 = 210;
    score.stages[0]!.stageTotalX10 = 210;
    score.stages[0]!.series[0]!.shots = [110, 100];
    score.stages[0]!.series[0]!.seriesTotalX10 = 210;

    expect(LaneScorePayloadSchema.safeParse(score).success).toBe(false);
  });

  it('rejects decimal shot values in RING scoring mode', () => {
    expect(LaneScorePayloadSchema.safeParse({ ...BASE_SCORE, acc: 'RING' }).success).toBe(false);
  });

  it('rejects duplicate stage and series indices', () => {
    const duplicateSeries = structuredClone(BASE_SCORE.stages[0]!.series[0]!);
    const duplicateStage = structuredClone(BASE_SCORE.stages[0]!);
    duplicateStage.series.push(duplicateSeries);
    duplicateStage.stageTotalX10 = 410;
    const score = {
      ...BASE_SCORE,
      stages: [duplicateStage, structuredClone(duplicateStage)],
      totalScoreX10: 820,
      totalShotCount: 8,
    };

    expect(LaneScorePayloadSchema.safeParse(score).success).toBe(false);
  });

  it('accepts a HIT/MISS projection only when its decimal source evidence agrees', () => {
    const projected = {
      ...BASE_SCORE,
      totalScoreX10: 10,
      resultProjection: {
        type: 'HIT_MISS' as const,
        source: 'EFFECTIVE_SCORE_X10' as const,
        hitThresholdX10: 102,
        hitValueX10: 10 as const,
        missValueX10: 0 as const,
        displayUnit: 'HITS' as const,
        preserveSourceScore: true as const,
        ruleReference: '6.17.5(c)',
      },
      sourceTotalScoreX10: 205,
      stages: [
        {
          ...BASE_SCORE.stages[0],
          stageTotalX10: 10,
          sourceStageTotalX10: 205,
          series: [
            {
              ...BASE_SCORE.stages[0]!.series[0],
              shots: [10, 0],
              seriesTotalX10: 10,
              sourceShotsX10: [105, 100],
              sourceSeriesTotalX10: 205,
            },
          ],
        },
      ],
    };

    expect(LaneScorePayloadSchema.safeParse(projected).success).toBe(true);
    projected.stages[0]!.series[0]!.shots = [0, 10];
    expect(LaneScorePayloadSchema.safeParse(projected).success).toBe(false);
  });
});

describe('RawShotPayloadSchema', () => {
  const legacyPayload = {
    laneId: '11111111-1111-4111-8111-111111111111',
    shotId: '22222222-2222-4222-8222-222222222222',
    x: 1.2,
    y: -0.4,
    rawScoreX10: 101,
    innerTen: false,
    mode: 'MATCH' as const,
    timestamp: '2026-08-28T00:00:00.000Z',
  };

  it('keeps accepting the legacy effective-score alias', () => {
    expect(RawShotPayloadSchema.safeParse(legacyPayload).success).toBe(true);
  });

  it('accepts separately named device, calculated, and effective score evidence', () => {
    const parsed = RawShotPayloadSchema.safeParse({
      ...legacyPayload,
      deviceScoreX10: 99,
      calculatedScoreX10: 102,
      effectiveScoreX10: 101,
      observationId: '33333333-3333-4333-8333-333333333333',
      receivedAt: '2026-08-28T00:00:00.050Z',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('25m Final shoot-off protocol', () => {
  const command = {
    commandId: '11111111-1111-4111-8111-111111111111',
    issuedBy: 'director',
    issuedAt: '2026-09-03T00:00:00.000Z',
    runId: '22222222-2222-4222-8222-222222222222',
    iteration: 1,
    timerStartAt: '2026-09-03T00:00:03.000Z',
    shotsPerLane: 5,
    targetLaneIds: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'],
  };

  it('accepts timed-target shoot-off commands without a generic duration', () => {
    expect(
      StartShootOffCommandSchema.safeParse({
        ...command,
        timedTarget: { programId: 'RFPM_FINAL_SHOOT_OFF_4', participantExecution: 'SEQUENTIAL' },
      }).success,
    ).toBe(true);
  });

  it('accepts SHOOT_OFF in Lane timed-target state telemetry', () => {
    expect(
      TimedTargetStatePayloadSchema.safeParse({
        schemaVersion: 1,
        laneId: command.targetLaneIds[0],
        sequenceId: command.commandId,
        competitionId: '55555555-5555-4555-8555-555555555555',
        programId: 'RFPM_FINAL_SHOOT_OFF_4',
        programLabel: 'Final four-second shoot-off series',
        purpose: 'SHOOT_OFF',
        stageIndex: 1,
        seriesIndex: 5,
        targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
        ruleReference: '6.17.4(i,k)',
        phase: 'ARMED',
        signal: 'RED',
        shotWindowOpen: false,
        exposureIndex: null,
        exposureCount: 1,
        acceptedShotsInExposure: 0,
        loadAt: command.timerStartAt,
        attentionAt: '2026-09-03T00:00:23.000Z',
        completesAt: '2026-09-03T00:00:34.300Z',
        nextLoadAllowedAt: '2026-09-03T00:00:44.300Z',
        nextTransitionAt: command.timerStartAt,
        terminalReason: null,
        enforcementMode: 'REQUIRED',
        publishedAt: command.issuedAt,
      }).success,
    ).toBe(true);
  });
});

describe('Qualification recovery protocol', () => {
  const authorization = {
    phase: 'SERIES_RECOVERY' as const,
    seriesRecovery: {
      treatment: 'COMPLETE_REMAINING_SHOTS' as const,
      shotsToFire: 3,
      execution: { mode: 'SECONDS_PER_SHOT' as const, secondsPerShot: 48, totalSeconds: 144 },
    },
  };
  const command = {
    commandId: '11111111-1111-4111-8111-111111111111',
    issuedBy: 'Jury Member',
    issuedAt: '2026-09-03T00:00:00.000Z',
    runId: '22222222-2222-4222-8222-222222222222',
    decisionId: '33333333-3333-4333-8333-333333333333',
    interruptionId: '44444444-4444-4444-8444-444444444444',
    stageIndex: 1,
    seriesIndex: 2,
    expectedMatchProgramId: 'P25_MATCH_PRECISION_300',
    expectedSeriesShotLimit: 5,
    expectedRecordedShots: 2,
    authorization,
    loadAt: '2026-09-03T00:00:03.000Z',
    officialName: 'Jury Member',
    decisionRuleReference: 'ISSF 8.8.1.4(a)',
    decidedAt: '2026-09-02T23:59:00.000Z',
  };

  it('accepts only firing authorizations with internally consistent timing', () => {
    expect(StartQualificationRecoveryCommandSchema.safeParse(command).success).toBe(true);
    expect(QualificationRecoveryFiringAuthorizationSchema.safeParse(authorization).success).toBe(true);
    expect(
      QualificationRecoveryFiringAuthorizationSchema.safeParse({
        ...authorization,
        seriesRecovery: {
          ...authorization.seriesRecovery,
          execution: { ...authorization.seriesRecovery.execution, totalSeconds: 100 },
        },
      }).success,
    ).toBe(false);
    expect(
      QualificationRecoveryFiringAuthorizationSchema.safeParse({
        phase: 'SERIES_RECOVERY',
        seriesRecovery: { treatment: 'KEEP_RECORDED_SERIES', shotsToFire: 0, execution: null },
      }).success,
    ).toBe(false);
  });

  it('accepts a separate official command for applying completed recovery evidence', () => {
    const applyCommand = {
      commandId: '88888888-8888-4888-8888-888888888888',
      issuedBy: 'Jury Member B',
      issuedAt: '2026-09-03T00:03:01.000Z',
      runId: command.runId,
      appliedBy: 'Jury Member B',
      statement: 'The completed recovery evidence was checked and may be scored.',
      appliedAt: '2026-09-03T00:03:00.000Z',
    };

    expect(ApplyQualificationRecoveryCommandSchema.safeParse(applyCommand).success).toBe(true);
    expect(ApplyQualificationRecoveryCommandSchema.safeParse({ ...applyCommand, statement: '   ' }).success).toBe(
      false,
    );
  });

  it('accepts a separate no-fire command only for a full retained series', () => {
    const settleCommand = {
      commandId: '99999999-9999-4999-8999-999999999999',
      issuedBy: 'Jury Member B',
      issuedAt: '2026-09-03T00:03:01.000Z',
      decisionId: command.decisionId,
      interruptionId: command.interruptionId,
      stageIndex: command.stageIndex,
      seriesIndex: command.seriesIndex,
      expectedMatchProgramId: command.expectedMatchProgramId,
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 5,
      treatment: 'KEEP_RECORDED_SERIES',
      decisionOfficialName: 'Jury Member A',
      decisionRuleReference: 'ISSF 8.8.1',
      decidedAt: '2026-09-03T00:02:00.000Z',
      appliedBy: 'Jury Member B',
      statement: 'The full recorded series was checked and retained.',
      appliedAt: '2026-09-03T00:03:00.000Z',
    };

    expect(SettleQualificationRecoveryCommandSchema.safeParse(settleCommand).success).toBe(true);
    expect(
      SettleQualificationRecoveryCommandSchema.safeParse({ ...settleCommand, expectedRecordedShots: 4 }).success,
    ).toBe(false);
  });

  it('accepts the retained run state and isolated shot evidence published by Lane', () => {
    expect(
      QualificationRecoveryStatePayloadSchema.safeParse({
        schemaVersion: 1,
        laneId: '55555555-5555-4555-8555-555555555555',
        runId: command.runId,
        sequenceId: command.runId,
        decisionId: command.decisionId,
        interruptionId: command.interruptionId,
        competitionId: '66666666-6666-4666-8666-666666666666',
        stageIndex: command.stageIndex,
        seriesIndex: command.seriesIndex,
        expectedMatchProgramId: command.expectedMatchProgramId,
        executionProgramId: 'P25_MATCH_PRECISION_300:qualification-recovery',
        expectedSeriesShotLimit: command.expectedSeriesShotLimit,
        expectedRecordedShots: command.expectedRecordedShots,
        authorization,
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        loadAt: command.loadAt,
        officialName: command.officialName,
        decisionRuleReference: command.decisionRuleReference,
        decidedAt: command.decidedAt,
        startedAt: command.issuedAt,
        status: 'RUNNING',
        terminalReason: null,
        terminalAt: null,
        shots: [],
        publishedAt: command.issuedAt,
      }).success,
    ).toBe(true);
    expect(
      QualificationRecoveryShotPayloadSchema.safeParse({
        schemaVersion: 1,
        laneId: '55555555-5555-4555-8555-555555555555',
        competitionId: '66666666-6666-4666-8666-666666666666',
        runId: command.runId,
        decisionId: command.decisionId,
        interruptionId: command.interruptionId,
        phase: 'SERIES_RECOVERY',
        stageIndex: command.stageIndex,
        seriesIndex: command.seriesIndex,
        shotId: '77777777-7777-4777-8777-777777777777',
        x: 1.1,
        y: -0.2,
        rawScoreX10: 101,
        deviceScoreX10: 100,
        calculatedScoreX10: 101,
        effectiveScoreX10: 101,
        innerTen: false,
        firedAt: command.loadAt,
        receivedAt: '2026-09-03T00:00:03.010Z',
        publishedAt: '2026-09-03T00:00:03.020Z',
      }).success,
    ).toBe(true);
  });
});
