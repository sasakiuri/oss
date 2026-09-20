// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

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
