import { describe, expect, it } from 'vitest';

import { detectFiringWindowViolations } from '@/main/modules/mqtt/application/FiringWindowDetector';
import type { CompetitionShotObservation } from '@/main/modules/mqtt/domain/ICompetitionShotJournal';
import type { FiringCommandBoundary } from '@/main/modules/mqtt/domain/IFiringWindowJournal';
import type { FiringWindowDetectionPolicy, FiringWindowViolationKind } from '@/shared/competitionTypes';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const BASE_TIME = Date.parse('2026-08-30T00:00:00.000Z');

const policy: FiringWindowDetectionPolicy = {
  timestampSource: 'FIRED_AT',
  clockToleranceMilliseconds: 1_000,
  rules: [
    rule('BEFORE_PREPARATION_AND_SIGHTING_START'),
    rule('BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START'),
    rule('AFTER_MATCH_STOP'),
  ],
};

describe('detectFiringWindowViolations', () => {
  it('detects a shot before Preparation and Sighting START but suppresses clock-adjacent evidence', () => {
    const boundaries = [boundary('sighting-open', 'SIGHTING', 'OPEN', 10_000)];

    expect(detectKinds(shotAt(8_000), boundaries)).toEqual(['BEFORE_PREPARATION_AND_SIGHTING_START']);
    expect(detectKinds(shotAt(9_500), boundaries)).toEqual([]);
    expect(detectKinds(shotAt(12_000), boundaries)).toEqual([]);
  });

  it('detects a shot between Sighting STOP and MATCH START', () => {
    const boundaries = [
      boundary('sighting-open', 'SIGHTING', 'OPEN', 10_000),
      boundary('sighting-close', 'SIGHTING', 'CLOSE', 20_000),
      boundary('match-open', 'MATCH', 'OPEN', 30_000),
    ];

    expect(detectKinds(shotAt(25_000), boundaries)).toEqual(['BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START']);
    expect(detectKinds(shotAt(20_500), boundaries)).toEqual([]);
    expect(detectKinds(shotAt(29_500), boundaries)).toEqual([]);
    expect(detectKinds(shotAt(32_000), boundaries)).toEqual([]);
  });

  it('detects a shot after MATCH STOP and permits a later restart', () => {
    const closed = [boundary('match-open', 'MATCH', 'OPEN', 30_000), boundary('match-close', 'MATCH', 'CLOSE', 40_000)];

    expect(detectKinds(shotAt(42_000), closed)).toEqual(['AFTER_MATCH_STOP']);
    expect(detectKinds(shotAt(40_500), closed)).toEqual([]);
    expect(detectKinds(shotAt(52_000), [...closed, boundary('match-reopen', 'MATCH', 'OPEN', 50_000)])).toEqual([]);
  });

  it('uses the configured evidence timestamp independently of the device firing clock', () => {
    const observedPolicy: FiringWindowDetectionPolicy = { ...policy, timestampSource: 'OBSERVED_AT' };
    const observation = {
      ...shotAt(8_000),
      observedAt: new Date(BASE_TIME + 12_000),
    };

    expect(
      detectFiringWindowViolations(
        observation,
        [boundary('sighting-open', 'SIGHTING', 'OPEN', 10_000)],
        observedPolicy,
      ),
    ).toEqual([]);
  });

  it('rejects an invalid local clock policy', () => {
    expect(() =>
      detectFiringWindowViolations(shotAt(8_000), [boundary('sighting-open', 'SIGHTING', 'OPEN', 10_000)], {
        ...policy,
        clockToleranceMilliseconds: -1,
      }),
    ).toThrow('Firing-window clock tolerance must be a non-negative integer');
  });
});

function detectKinds(
  observation: CompetitionShotObservation,
  boundaries: FiringCommandBoundary[],
): FiringWindowViolationKind[] {
  return detectFiringWindowViolations(observation, boundaries, policy).map((match) => match.kind);
}

function rule(kind: FiringWindowViolationKind) {
  return {
    id: `rule.${kind}`,
    kind,
    ruleReference: '6.11.1',
    reviewGuidance: 'Review the shot.',
  } as const;
}

function boundary(
  id: string,
  phase: FiringCommandBoundary['phase'],
  transition: FiringCommandBoundary['transition'],
  offsetMilliseconds: number,
): FiringCommandBoundary {
  return {
    id,
    competitionId: COMPETITION_ID,
    phase,
    transition,
    occurredAt: new Date(BASE_TIME + offsetMilliseconds),
    commandId: `command-${id}`,
    commandIssuedAt: new Date(BASE_TIME + offsetMilliseconds),
    sourceAction: transition === 'OPEN' ? (phase === 'MATCH' ? 'start-match' : 'start-sighting') : 'timer-expired',
    recordedAt: new Date(BASE_TIME + offsetMilliseconds),
  };
}

function shotAt(offsetMilliseconds: number): CompetitionShotObservation {
  const time = new Date(BASE_TIME + offsetMilliseconds);
  return {
    id: `observation-${offsetMilliseconds}`,
    competitionId: COMPETITION_ID,
    laneId: '22222222-2222-4222-8222-222222222222',
    sessionId: '33333333-3333-4333-8333-333333333333',
    shotId: `shot-${offsetMilliseconds}`,
    sourceObservationId: null,
    x: 0,
    y: 0,
    legacyRawScoreX10: 100,
    deviceScoreX10: 100,
    calculatedScoreX10: 100,
    calculatedScoreAvailable: true,
    effectiveScoreX10: 100,
    innerTen: false,
    mode: 'MATCH',
    firedAt: time,
    receivedAt: time,
    stageIndex: 1,
    scored: true,
    seriesIndex: 0,
    shotNumberInSeries: 1,
    isRecorded: true,
    isReplay: false,
    publishedAt: time,
    observedAt: time,
    payloadJson: '{}',
  };
}
