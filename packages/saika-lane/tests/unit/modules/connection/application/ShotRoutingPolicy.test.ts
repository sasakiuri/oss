// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S, P25 } from '@/main/modules/competition/domain/competitionTypes';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import {
  CLOSED_SHOOT_OFF_WINDOW,
  decideShotAdmission,
  decideShotRecording,
  resolveShotProfiles,
  timedTargetShotRequest,
} from '@/main/modules/connection/application/ShotRoutingPolicy';
import type { TimedTargetShotDecision } from '@/main/modules/timed-target';

import { athleteCompetition, selectAthlete } from '../../../../helpers/athleteCompetition';

const SHOT = {
  observationId: 'observation-1',
  firedAt: new Date('2026-01-15T10:00:00Z'),
  timestampSource: 'LANE_RECEIPT' as const,
};

function p25Match(): CompetitionState {
  return CompetitionState.create('competition-25', 'session-25', P25.config)
    .startStage()
    .expireTimer()
    .advanceToNextStage()
    .startNextSeries();
}

function br60(): CompetitionState {
  return CompetitionState.create('competition-10', 'session-10', BR60S.config);
}

function decision(overrides: Partial<TimedTargetShotDecision> = {}): TimedTargetShotDecision {
  return {
    governed: true,
    allowed: true,
    purpose: 'MATCH',
    targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
    sequenceId: 'sequence-1',
    exposureIndex: 0,
    warning: null,
    reason: 'inside',
    ...overrides,
  };
}

describe('timedTargetShotRequest', () => {
  it('is null without a competition or for a shoot-off window without a program', () => {
    expect(timedTargetShotRequest(null, CLOSED_SHOOT_OFF_WINDOW, SHOT)).toBeNull();
    expect(timedTargetShotRequest(p25Match(), { open: true }, SHOT)).toBeNull();
  });

  it('is null when neither the series nor a shoot-off names a program', () => {
    expect(timedTargetShotRequest(br60().startStage(), CLOSED_SHOOT_OFF_WINDOW, SHOT)).toBeNull();
  });

  it('asks for the series, stage sighting and shoot-off programs with the stage face', () => {
    const competition = p25Match();

    expect(timedTargetShotRequest(competition, { open: true, timedTargetProgramId: 'SHOOT_OFF' }, SHOT)).toEqual({
      competitionId: competition.id,
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSightingProgramId: 'P25_SIGHTING_PRECISION_240',
      expectedShootOffProgramId: 'SHOOT_OFF',
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      observationId: 'observation-1',
      firedAt: SHOT.firedAt,
      timestampSource: 'LANE_RECEIPT',
    });
  });

  it('asks only for a shoot-off program outside a timed-target series', () => {
    const competition = br60().startStage();

    expect(
      timedTargetShotRequest(
        CompetitionState.reconstruct({
          ...competition,
          config: { ...competition.config, targetProfileId: 'ISSF_AIR_RIFLE_10M_2026' },
        }),
        { open: true, timedTargetProgramId: 'SHOOT_OFF' },
        SHOT,
      ),
    ).toEqual(expect.objectContaining({ expectedShootOffProgramId: 'SHOOT_OFF' }));
  });

  it('throws when a governed stage has no target scoring profile', () => {
    const competition = p25Match();
    const config = {
      ...competition.config,
      targetProfileId: undefined,
      stages: competition.config.stages.map((stage) => ({ ...stage, targetProfileId: undefined })),
    };

    expect(() =>
      timedTargetShotRequest(CompetitionState.reconstruct({ ...competition, config }), CLOSED_SHOOT_OFF_WINDOW, SHOT),
    ).toThrow('Timed target stage has no target scoring profile');
  });
});

describe('decideShotAdmission', () => {
  const admit = (facts: Partial<Parameters<typeof decideShotAdmission>[0]>) =>
    decideShotAdmission({
      competition: null,
      safetyStopId: null,
      shootOff: CLOSED_SHOOT_OFF_WINDOW,
      timedTarget: null,
      ...facts,
    });

  it('quarantines every shot while the safety latch is stopped', () => {
    expect(admit({ safetyStopId: 'stop-1', competition: br60().startStage() })).toEqual({
      admitted: false,
      type: 'QUARANTINED_SAFETY_STOP',
      sessionId: 'session-10',
      detail: 'safetyStopId=stop-1',
    });
    expect(admit({ safetyStopId: 'unknown' })).toEqual({
      admitted: false,
      type: 'QUARANTINED_SAFETY_STOP',
      detail: 'safetyStopId=unknown',
    });
  });

  it.each([
    [true, 'QUARANTINED_TIMING_REVIEW'],
    [false, 'REJECTED_TIMED_TARGET_WINDOW'],
    [undefined, 'REJECTED_TIMED_TARGET_WINDOW'],
  ] as const)('holds or rejects a refused timed-target shot (review=%s)', (timingReviewRequired, type) => {
    expect(
      admit({
        competition: p25Match(),
        timedTarget: decision({ allowed: false, reason: 'outside', timingReviewRequired }),
      }),
    ).toEqual({ admitted: false, type, sessionId: 'session-25', detail: 'outside' });
  });

  it('rejects a shot outside an accepting competition phase', () => {
    expect(admit({ competition: br60().startStage().expireTimer() })).toEqual({
      admitted: false,
      type: 'REJECTED_COMPETITION_PHASE',
      sessionId: 'session-10',
      detail: 'phase=SERIES_COMPLETE',
    });
  });

  it.each([
    ['an open shoot-off window', { shootOff: { open: true } }, true],
    ['an allowed timed-target shot', { timedTarget: decision() }, false],
    [
      'a shoot-off window whose program allowed the shot',
      { shootOff: { open: true, timedTargetProgramId: 'SHOOT_OFF' }, timedTarget: decision() },
      true,
    ],
  ] as const)('admits a shot outside the phase through %s', (_, facts, acceptedByShootOff) => {
    expect(admit({ competition: br60().startStage().expireTimer(), ...facts })).toEqual({
      admitted: true,
      acceptedByShootOff,
    });
  });

  it('does not accept a shot through a shoot-off window whose program refused it', () => {
    expect(
      admit({
        competition: br60().startStage().expireTimer(),
        shootOff: { open: true, timedTargetProgramId: 'SHOOT_OFF' },
      }),
    ).toMatchObject({ admitted: false, type: 'REJECTED_COMPETITION_PHASE' });
  });

  it.each([
    ['without a competition', null],
    ['in an accepting phase', br60()],
  ])('admits a shot %s', (_, competition) => {
    expect(admit({ competition })).toEqual({ admitted: true, acceptedByShootOff: false });
  });
});

describe('decideShotRecording', () => {
  const record = (facts: Partial<Parameters<typeof decideShotRecording>[0]>) =>
    decideShotRecording({
      competition: null,
      sessionShots: [],
      interruption: null,
      acceptedByShootOff: false,
      timedTarget: null,
      reportedMode: undefined,
      ...facts,
    });

  it('stores shoot-off shots as Sighting', () => {
    expect(record({ competition: br60().startStage(), acceptedByShootOff: true, reportedMode: 'MATCH' })).toEqual({
      nullify: false,
      mode: expect.objectContaining({ value: 'SIGHTING' }),
      athleteModeObserved: false,
    });
  });

  it('stores shots during an official Sighting interruption as Sighting', () => {
    const competition = br60().startStage().endStage().advanceToNextStage().startNextSeries();
    const interruption = LaneInterruptionRecord.create({
      competitionId: competition.id,
      interruptionId: 'interruption-1',
      status: 'RESUME_PENDING',
      unlimitedSightingShots: true,
      pausedAt: new Date(),
      capturedAt: new Date(),
      capturedRemainingSeconds: 240,
      capturedTotalSeconds: 600,
    });

    expect(record({ competition, interruption, reportedMode: 'MATCH' })).toMatchObject({
      nullify: false,
      mode: { value: 'SIGHTING' },
    });
  });

  it.each([
    ['an isolated acquisition', decision({ executionContext: { shotDisposition: 'ISOLATED' } as never }), 'SIGHTING'],
    ['a Sighting program', decision({ purpose: 'SIGHTING' }), 'SIGHTING'],
    ['a Match program', decision(), 'MATCH'],
  ] as const)('takes the mode of %s from the timed-target decision', (_, timedTarget, mode) => {
    expect(record({ competition: p25Match(), timedTarget, reportedMode: 'SIGHTING' })).toEqual({
      nullify: false,
      mode: expect.objectContaining({ value: mode }),
      athleteModeObserved: false,
    });
  });

  it('nullifies a Match extra before the required Sighting of a new position', () => {
    expect(record({ competition: athleteCompetition(), reportedMode: 'MATCH' })).toEqual({
      nullify: true,
      detail: 'Nullified extra — previous Kneeling position · ISSF 6.10.4(c) / 7.7.3',
    });
  });

  it('marks an athlete-controlled series shot as an observation of the athlete mode', () => {
    expect(record({ competition: athleteCompetition(), reportedMode: 'SIGHTING' })).toEqual({
      nullify: false,
      mode: expect.objectContaining({ value: 'SIGHTING' }),
      athleteModeObserved: true,
    });
    expect(record({ competition: selectAthlete(athleteCompetition(), 'SIGHTING'), reportedMode: 'MATCH' })).toEqual(
      expect.objectContaining({ nullify: false, athleteModeObserved: true }),
    );
  });

  it('uses the persisted stage over the reported mode', () => {
    expect(record({ competition: br60().startStage(), reportedMode: 'MATCH' })).toMatchObject({
      mode: { value: 'SIGHTING' },
      athleteModeObserved: false,
    });
  });

  it.each(['MATCH', 'SIGHTING'] as const)('keeps the reported mode %s without a competition', (reportedMode) => {
    expect(record({ reportedMode })).toEqual({
      nullify: false,
      mode: expect.objectContaining({ value: reportedMode }),
      athleteModeObserved: false,
    });
  });

  it('leaves the mode unset without a competition or a reported mode', () => {
    expect(record({})).toEqual({ nullify: false, mode: undefined, athleteModeObserved: false });
  });
});

describe('resolveShotProfiles', () => {
  it('prefers the timed-target face, then the stage, and adds the round gauge', () => {
    expect(resolveShotProfiles(p25Match(), decision({ targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026' }))).toEqual({
      targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    });
    expect(resolveShotProfiles(p25Match(), null)).toEqual({
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    });
  });

  it('is empty without a competition or a timed-target face', () => {
    expect(resolveShotProfiles(null, null)).toEqual({});
  });

  it.each([
    [{ targetProfileId: 'NOT_A_FACE' }, 'Unknown target scoring profile: NOT_A_FACE'],
    [{ scoringGaugeProfileId: 'NOT_A_GAUGE' }, 'Unknown scoring gauge profile: NOT_A_GAUGE'],
  ])('rejects an unknown profile %o', (override, message) => {
    const competition = CompetitionState.create('competition-10', 'session-10', { ...BR60S.config, ...override });

    expect(() => resolveShotProfiles(competition, null)).toThrow(message);
  });
});
