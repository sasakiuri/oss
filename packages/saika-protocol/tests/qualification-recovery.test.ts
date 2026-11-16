// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  ApplyQualificationRecoveryCommandSchema,
  SettleQualificationRecoveryCommandSchema,
  StartQualificationRecoveryCommandSchema,
} from '../src/commands';
import {
  QualificationRecoveryFiringAuthorizationSchema,
  QualificationRecoveryShotPayloadSchema,
  QualificationRecoveryStatePayloadSchema,
} from '../src/QualificationRecovery';

const id = '11111111-1111-4111-8111-111111111111';
const at = '2026-09-09T00:00:00.000Z';
const completion = {
  phase: 'SERIES_RECOVERY',
  seriesRecovery: {
    treatment: 'COMPLETE_REMAINING_SHOTS',
    shotsToFire: 2,
    execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 7, totalSeconds: 14 },
  },
};
const state = {
  schemaVersion: 1,
  laneId: id,
  runId: id,
  sequenceId: id,
  decisionId: id,
  interruptionId: id,
  competitionId: id,
  stageIndex: 0,
  seriesIndex: 0,
  expectedMatchProgramId: 'match',
  executionProgramId: 'recovery',
  expectedSeriesShotLimit: 5,
  expectedRecordedShots: 0,
  authorization: completion,
  targetProfileId: 'target',
  loadAt: at,
  officialName: 'Range officer',
  decisionRuleReference: '8.9',
  decidedAt: at,
  startedAt: at,
  status: 'RUNNING',
  terminalReason: null,
  terminalAt: null,
  shots: [{ shotId: id, observationId: null, firedAt: at, recordedAt: at }],
  publishedAt: at,
};
const shot = {
  schemaVersion: 1,
  laneId: id,
  competitionId: id,
  runId: id,
  decisionId: id,
  interruptionId: id,
  phase: 'EXTRA_SIGHTING',
  stageIndex: 0,
  seriesIndex: 0,
  shotId: id,
  x: null,
  y: null,
  rawScoreX10: 0,
  deviceScoreX10: null,
  calculatedScoreX10: 0,
  effectiveScoreX10: 0,
  innerTen: false,
  firedAt: at,
  receivedAt: at,
  publishedAt: at,
};

describe('Qualification recovery wire authorization', () => {
  it.each([
    { phase: 'EXTRA_SIGHTING', shotsToFire: 1 },
    completion,
    {
      ...completion,
      sightingPrerequisite: { runId: id, minimumPauseSeconds: 0 },
    },
    {
      phase: 'SERIES_RECOVERY',
      seriesRecovery: {
        treatment: 'ANNUL_AND_REPEAT',
        shotsToFire: 5,
        execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
      },
    },
    {
      phase: 'SERIES_RECOVERY',
      seriesRecovery: {
        treatment: 'COMPLETE_REMAINING_SHOTS',
        shotsToFire: 1,
        execution: { mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES' },
      },
    },
  ])('preserves supported authorization %# without changing its firing limits', (authorization) => {
    expect(QualificationRecoveryFiringAuthorizationSchema.parse(authorization)).toEqual(authorization);
  });

  it.each([1, 7, 13, 15, 21])('rejects an inconsistent total firing time of %i seconds', (totalSeconds) => {
    const result = QualificationRecoveryFiringAuthorizationSchema.safeParse({
      ...completion,
      seriesRecovery: {
        ...completion.seriesRecovery,
        execution: { ...completion.seriesRecovery.execution, totalSeconds },
      },
    });
    expect(result.error?.issues).toEqual([
      {
        code: 'custom',
        path: ['seriesRecovery', 'execution', 'totalSeconds'],
        message: 'totalSeconds must equal secondsPerShot multiplied by shotsToFire',
      },
    ]);
  });

  it.each([0, -1, 1.5])('rejects invalid extra sighting and recovery shot counts: %s', (shotsToFire) => {
    expect(
      QualificationRecoveryFiringAuthorizationSchema.safeParse({ phase: 'EXTRA_SIGHTING', shotsToFire }).success,
    ).toBe(false);
    expect(
      QualificationRecoveryFiringAuthorizationSchema.safeParse({
        ...completion,
        seriesRecovery: { ...completion.seriesRecovery, shotsToFire },
      }).success,
    ).toBe(false);
  });

  it('preserves zero pause and requires nonnegative integral sighting prerequisites', () => {
    for (const minimumPauseSeconds of [-1, 0.5]) {
      expect(
        QualificationRecoveryFiringAuthorizationSchema.safeParse({
          ...completion,
          sightingPrerequisite: { runId: id, minimumPauseSeconds },
        }).success,
      ).toBe(false);
    }
  });
});

describe('Qualification recovery state and shot payloads', () => {
  it('preserves running and terminal state, including null observation provenance', () => {
    expect(QualificationRecoveryStatePayloadSchema.parse(state)).toEqual(state);
    for (const status of ['COMPLETED', 'CANCELLED']) {
      const terminal = {
        ...state,
        status,
        terminalReason: 'Official decision',
        terminalAt: at,
        shots: [{ ...state.shots[0], observationId: id }],
      };
      expect(QualificationRecoveryStatePayloadSchema.parse(terminal)).toEqual(terminal);
    }
  });

  it('accepts empty shot evidence before acquisition begins', () => {
    expect(QualificationRecoveryStatePayloadSchema.parse({ ...state, shots: [] }).shots).toEqual([]);
  });

  it('preserves both phase variants, inclusive score boundaries, and optional score provenance', () => {
    expect(QualificationRecoveryShotPayloadSchema.parse(shot)).toEqual(shot);
    const recorded = {
      ...shot,
      phase: 'SERIES_RECOVERY',
      x: -1.2,
      y: 3.4,
      rawScoreX10: 109,
      deviceScoreX10: 109,
      calculatedScoreX10: 109,
      effectiveScoreX10: 109,
      innerTen: true,
      observationId: id,
      targetProfileId: 'target',
      scoringGaugeProfileId: 'gauge',
    };
    expect(QualificationRecoveryShotPayloadSchema.parse(recorded)).toEqual(recorded);
  });

  it.each(['rawScoreX10', 'deviceScoreX10', 'calculatedScoreX10', 'effectiveScoreX10'])(
    'rejects out-of-range and fractional wire scores in %s',
    (field) => {
      for (const value of [-1, 110, 10.5]) {
        expect(QualificationRecoveryShotPayloadSchema.safeParse({ ...shot, [field]: value }).success).toBe(false);
      }
    },
  );

  it.each(['expectedMatchProgramId', 'executionProgramId', 'targetProfileId', 'officialName', 'decisionRuleReference'])(
    'requires a nonempty %s in state',
    (field) => {
      expect(QualificationRecoveryStatePayloadSchema.safeParse({ ...state, [field]: '' }).success).toBe(false);
    },
  );

  it.each(['targetProfileId', 'scoringGaugeProfileId'])('rejects an empty optional %s in shot evidence', (field) => {
    expect(QualificationRecoveryShotPayloadSchema.safeParse({ ...shot, [field]: '' }).success).toBe(false);
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
