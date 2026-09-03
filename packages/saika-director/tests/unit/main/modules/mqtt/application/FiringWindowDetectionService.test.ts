import { describe, expect, it, vi } from 'vitest';

import { FiringWindowDetectionService } from '@/main/modules/mqtt/application/FiringWindowDetectionService';
import type {
  CompetitionShotObservation,
  ICompetitionShotJournal,
} from '@/main/modules/mqtt/domain/ICompetitionShotJournal';
import type {
  FiringCommandBoundary,
  FiringWindowViolation,
  IFiringWindowJournal,
} from '@/main/modules/mqtt/domain/IFiringWindowJournal';
import type { FiringWindowDetectionPolicy } from '@/shared/competitionTypes';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';

describe('FiringWindowDetectionService', () => {
  it('reconciles earlier observations and emits one review event across MQTT replays', () => {
    const observation = makeObservation('observation-1');
    const shotJournal: ICompetitionShotJournal = {
      append: vi.fn(),
      findByCompetition: vi.fn(() => [observation, makeObservation('observation-replay')]),
    };
    const boundaries: FiringCommandBoundary[] = [];
    const violations: FiringWindowViolation[] = [];
    const violationKeys = new Set<string>();
    const firingWindowJournal: IFiringWindowJournal = {
      appendBoundary: vi.fn((boundary) => {
        boundaries.push(boundary);
        return true;
      }),
      findBoundariesByCompetition: vi.fn(() => boundaries),
      appendViolation: vi.fn((violation) => {
        const key = `${violation.competitionId}:${violation.laneId}:${violation.sessionId}:${violation.shotId}:${violation.policyRuleId}`;
        if (violationKeys.has(key)) return false;
        violationKeys.add(key);
        violations.push(violation);
        return true;
      }),
      findViolationsByCompetition: vi.fn(() => violations),
    };
    const onViolationDetected = vi.fn();
    let id = 0;
    const service = new FiringWindowDetectionService(shotJournal, firingWindowJournal, {
      createId: () => `generated-${++id}`,
      now: () => new Date('2026-08-30T00:00:20.000Z'),
      onViolationDetected,
    });

    service.recordBoundary(
      {
        competitionId: COMPETITION_ID,
        phase: 'SIGHTING',
        transition: 'OPEN',
        occurredAt: new Date('2026-08-30T00:00:10.000Z'),
        commandId: 'command-1',
        commandIssuedAt: new Date('2026-08-30T00:00:09.000Z'),
        sourceAction: 'start-sighting',
      },
      policy,
    );
    service.observe(makeObservation('observation-third-delivery'), policy);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      observationId: 'observation-1',
      policyRuleId: 'before-start',
      kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
    });
    expect(onViolationDetected).toHaveBeenCalledTimes(1);
  });
});

const policy: FiringWindowDetectionPolicy = {
  timestampSource: 'FIRED_AT',
  clockToleranceMilliseconds: 0,
  rules: [
    {
      id: 'before-start',
      kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
      ruleReference: '6.11.1.1(h)',
      reviewGuidance: 'Review the shot.',
    },
  ],
};

function makeObservation(id: string): CompetitionShotObservation {
  const firedAt = new Date('2026-08-30T00:00:05.000Z');
  return {
    id,
    competitionId: COMPETITION_ID,
    laneId: '22222222-2222-4222-8222-222222222222',
    sessionId: '33333333-3333-4333-8333-333333333333',
    shotId: '44444444-4444-4444-8444-444444444444',
    sourceObservationId: null,
    x: 0,
    y: 0,
    legacyRawScoreX10: 100,
    deviceScoreX10: 100,
    calculatedScoreX10: 100,
    calculatedScoreAvailable: true,
    effectiveScoreX10: 100,
    targetProfileId: null,
    scoringGaugeProfileId: null,
    innerTen: false,
    mode: 'SIGHTING',
    firedAt,
    receivedAt: firedAt,
    stageIndex: 0,
    scored: true,
    seriesIndex: 0,
    shotNumberInSeries: 1,
    isRecorded: true,
    isReplay: id.includes('replay'),
    publishedAt: firedAt,
    observedAt: firedAt,
    payloadJson: '{}',
  };
}
